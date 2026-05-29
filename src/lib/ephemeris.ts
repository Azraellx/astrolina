import {
  julian,
  planetposition,
  elliptic,
  solar,
  moonposition,
  pluto,
  sidereal,
  nutation,
  coord,
} from 'astronomia';
import data from 'astronomia/data';
import type { BirthData } from './birthData';

export type PlanetName =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto'
  | 'NorthNode'
  | 'SouthNode'
  | 'Chiron'
  | 'Ceres'
  | 'Pallas'
  | 'Juno'
  | 'Vesta';

export const TRADITIONAL_PLANETS: PlanetName[] = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
];

export const EXTRA_BODIES: PlanetName[] = [
  'NorthNode',
  'SouthNode',
  'Chiron',
  'Ceres',
  'Pallas',
  'Juno',
  'Vesta',
];

export const PLANET_NAMES: PlanetName[] = [...TRADITIONAL_PLANETS, ...EXTRA_BODIES];

export const PLANET_DISPLAY: Record<PlanetName, string> = {
  Sun: 'Sun',
  Moon: 'Moon',
  Mercury: 'Mercury',
  Venus: 'Venus',
  Mars: 'Mars',
  Jupiter: 'Jupiter',
  Saturn: 'Saturn',
  Uranus: 'Uranus',
  Neptune: 'Neptune',
  Pluto: 'Pluto',
  NorthNode: 'N Node',
  SouthNode: 'S Node',
  Chiron: 'Chiron',
  Ceres: 'Ceres',
  Pallas: 'Pallas',
  Juno: 'Juno',
  Vesta: 'Vesta',
};

export const PLANET_CODES: Record<PlanetName, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mercury: 'Me',
  Venus: 'Ve',
  Mars: 'Ma',
  Jupiter: 'Ju',
  Saturn: 'Sa',
  Uranus: 'Ur',
  Neptune: 'Ne',
  Pluto: 'Pl',
  NorthNode: 'NN',
  SouthNode: 'SN',
  Chiron: 'Ch',
  Ceres: 'Cr',
  Pallas: 'Pa',
  Juno: 'Jn',
  Vesta: 'Vs',
};

export const PLANET_COLORS: Record<PlanetName, string> = {
  Sun: '#f5b83d',
  Moon: '#cfd6e4',
  Mercury: '#8ee0c8',
  Venus: '#f08aa8',
  Mars: '#e85a4f',
  Jupiter: '#c89a5a',
  Saturn: '#9b7adc',
  Uranus: '#5ec2e0',
  Neptune: '#5a7adc',
  Pluto: '#a85040',
  NorthNode: '#7adbb3',
  SouthNode: '#dc8a7a',
  Chiron: '#d4a374',
  Ceres: '#6cb8a8',
  Pallas: '#8a8ed4',
  Juno: '#d8a358',
  Vesta: '#e0b890',
};

export interface PlanetPosition {
  name: PlanetName;
  ra: number;
  dec: number;
}

export interface EclipticPosition {
  name: PlanetName;
  lon: number;
  // Optional advanced fields, populated by toEclipticPositions when the
  // expanded sidebar's "Advanced" mode wants declination / speed / retrograde.
  lat?: number;          // ecliptic latitude, radians
  dec?: number;          // equatorial declination, radians
  speed?: number;        // ecliptic longitude motion, degrees/day (negative = Rx)
  retrograde?: boolean;
}

export interface RelocatedAngles {
  asc: number;
  mc: number;
  dsc: number;
  ic: number;
}

const earth = new planetposition.Planet(data.vsop87Bearth);
const mercury = new planetposition.Planet(data.vsop87Bmercury);
const venus = new planetposition.Planet(data.vsop87Bvenus);
const mars = new planetposition.Planet(data.vsop87Bmars);
const jupiter = new planetposition.Planet(data.vsop87Bjupiter);
const saturn = new planetposition.Planet(data.vsop87Bsaturn);
const uranus = new planetposition.Planet(data.vsop87Buranus);
const neptune = new planetposition.Planet(data.vsop87Bneptune);

const DEG2RAD = Math.PI / 180;
const J2000 = 2451545.0;
const OBLIQUITY_J2000 = 23.4392911 * DEG2RAD;

// Mean orbital elements at J2000 (heliocentric ecliptic, mean equinox of J2000).
// Source: JPL HORIZONS / Minor Planet Center. Adequate to ~0.1° for ±200 years.
interface OrbitalElements {
  a: number;      // semi-major axis, AU
  e: number;      // eccentricity
  i: number;      // inclination, degrees
  node: number;   // longitude of ascending node Ω, degrees
  peri: number;   // argument of perihelion ω, degrees
  M0: number;     // mean anomaly at epoch, degrees
  n: number;      // mean motion, degrees/day
  epoch: number;  // epoch JD (J2000 for all of ours)
}

const MINOR_BODY_ELEMENTS: Record<string, OrbitalElements> = {
  Ceres:  { a: 2.7691651, e: 0.0760091, i: 10.59407, node:  80.30553, peri:  73.59764, M0:  95.989, n: 0.2140874, epoch: J2000 },
  Pallas: { a: 2.7720833, e: 0.2299960, i: 34.83975, node: 173.08006, peri: 309.93047, M0:  33.018, n: 0.2137462, epoch: J2000 },
  Juno:   { a: 2.6694780, e: 0.2570304, i: 12.98166, node: 169.85291, peri: 247.75126, M0:  33.408, n: 0.2262273, epoch: J2000 },
  Vesta:  { a: 2.3617934, e: 0.0886205, i:  7.14043, node: 103.91254, peri: 151.19853, M0:  24.474, n: 0.2716493, epoch: J2000 },
  Chiron: { a: 13.670893, e: 0.3823020, i:  6.93680, node: 209.37981, peri: 339.49532, M0: 102.926, n: 0.0195778, epoch: J2000 },
};

function solveKepler(M: number, e: number): number {
  let E = M;
  for (let i = 0; i < 8; i++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  return E;
}

// Heliocentric J2000 ecliptic cartesian coords (AU) for a body with orbital elements.
function heliocentricFromElements(
  elem: OrbitalElements,
  jd: number,
): { x: number; y: number; z: number } {
  const M = ((elem.M0 + elem.n * (jd - elem.epoch)) * DEG2RAD) % (2 * Math.PI);
  const E = solveKepler(M, elem.e);
  const xp = elem.a * (Math.cos(E) - elem.e);
  const yp = elem.a * Math.sqrt(1 - elem.e * elem.e) * Math.sin(E);
  const r = Math.sqrt(xp * xp + yp * yp);
  const v = Math.atan2(yp, xp);

  const i = elem.i * DEG2RAD;
  const omega = elem.node * DEG2RAD;
  const w = elem.peri * DEG2RAD;
  const u = v + w;

  const x = r * (Math.cos(omega) * Math.cos(u) - Math.sin(omega) * Math.sin(u) * Math.cos(i));
  const y = r * (Math.sin(omega) * Math.cos(u) + Math.cos(omega) * Math.sin(u) * Math.cos(i));
  const z = r * Math.sin(u) * Math.sin(i);
  return { x, y, z };
}

// Earth's heliocentric J2000 ecliptic cartesian coords (AU).
function earthHelio(jd: number): { x: number; y: number; z: number } {
  const { lon, lat, range } = earth.position(jd);
  const x = range * Math.cos(lat) * Math.cos(lon);
  const y = range * Math.cos(lat) * Math.sin(lon);
  const z = range * Math.sin(lat);
  return { x, y, z };
}

// Convert geocentric ecliptic cartesian -> apparent RA/dec (J2000 mean equator).
function eclCartToRaDec(
  x: number,
  y: number,
  z: number,
): { ra: number; dec: number } {
  // Rotate by -obliquity around the x-axis: ecliptic -> equatorial
  const cosE = Math.cos(OBLIQUITY_J2000);
  const sinE = Math.sin(OBLIQUITY_J2000);
  const xe = x;
  const ye = y * cosE - z * sinE;
  const ze = y * sinE + z * cosE;
  let ra = Math.atan2(ye, xe);
  if (ra < 0) ra += 2 * Math.PI;
  const dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye));
  return { ra, dec };
}

function minorBodyRaDec(name: keyof typeof MINOR_BODY_ELEMENTS, jd: number): { ra: number; dec: number } {
  const helio = heliocentricFromElements(MINOR_BODY_ELEMENTS[name], jd);
  const e = earthHelio(jd);
  return eclCartToRaDec(helio.x - e.x, helio.y - e.y, helio.z - e.z);
}

// Mean lunar north node (ecliptic longitude, degrees → returned as RA/dec).
// Standard formula: Ω = 125.04452 − 0.0529538083 · d, where d = JD − J2000.
function meanNodeRaDec(jd: number, isSouth: boolean): { ra: number; dec: number } {
  const d = jd - J2000;
  let lonDeg = 125.04452 - 0.0529538083 * d;
  if (isSouth) lonDeg += 180;
  lonDeg = ((lonDeg % 360) + 360) % 360;
  const lon = lonDeg * DEG2RAD;
  // Node lies on the ecliptic by definition (lat = 0).
  const x = Math.cos(lon);
  const y = Math.sin(lon);
  const z = 0;
  return eclCartToRaDec(x, y, z);
}

export function birthDataToJD(b: BirthData): number {
  const utcHour = b.hour + b.minute / 60 - b.tzOffset;
  const dayFraction = b.day + utcHour / 24;
  const cal = new julian.CalendarGregorian(b.year, b.month, dayFraction);
  return cal.toJD();
}

export function gmstRadians(jd: number): number {
  const secs = sidereal.mean(jd);
  return ((secs / 86400) * 2 * Math.PI) % (2 * Math.PI);
}

function moonEquatorial(jd: number): { ra: number; dec: number } {
  const { lon, lat } = moonposition.position(jd);
  const [dpsi, deps] = nutation.nutation(jd);
  const epsilon = nutation.meanObliquity(jd) + deps;
  const ecl = new coord.Ecliptic(lon + dpsi, lat);
  const eq = ecl.toEquatorial(epsilon);
  return { ra: eq.ra, dec: eq.dec };
}

export function obliquity(jd: number): number {
  const [, deps] = nutation.nutation(jd);
  return nutation.meanObliquity(jd) + deps;
}

function raDecToEclipticLon(ra: number, dec: number, eps: number): number {
  const lon = Math.atan2(
    Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
    Math.cos(ra),
  );
  return (lon + 2 * Math.PI) % (2 * Math.PI);
}

function raDecToEclipticLat(ra: number, dec: number, eps: number): number {
  return Math.asin(
    Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra),
  );
}

export function toEclipticPositions(
  positions: PlanetPosition[],
  jd: number,
): EclipticPosition[] {
  const eps = obliquity(jd);
  // Sample again ~12h later to derive ecliptic-longitude speed, which gives
  // us retrograde state and °/day motion for the advanced readout.
  const dt = 0.5;
  const positionsLater = getPlanetPositions(jd + dt);
  return positions.map((p, i) => {
    const lon = raDecToEclipticLon(p.ra, p.dec, eps);
    const lat = raDecToEclipticLat(p.ra, p.dec, eps);
    const lonLater = raDecToEclipticLon(
      positionsLater[i].ra,
      positionsLater[i].dec,
      eps,
    );
    let dlon = lonLater - lon;
    if (dlon > Math.PI) dlon -= 2 * Math.PI;
    if (dlon < -Math.PI) dlon += 2 * Math.PI;
    const speed = (dlon * 180) / Math.PI / dt;
    return {
      name: p.name,
      lon,
      lat,
      dec: p.dec,
      speed,
      retrograde: speed < 0,
    };
  });
}

export function relocate(
  jd: number,
  latDeg: number,
  lngDeg: number,
): RelocatedAngles {
  const eps = obliquity(jd);
  const gmst = gmstRadians(jd);
  const phi = (latDeg * Math.PI) / 180;
  const lst = (gmst + (lngDeg * Math.PI) / 180 + 2 * Math.PI) % (2 * Math.PI);
  const sinLst = Math.sin(lst);
  const cosLst = Math.cos(lst);
  const cosEps = Math.cos(eps);
  const sinEps = Math.sin(eps);

  let mc = Math.atan2(sinLst, cosLst * cosEps);
  if (mc < 0) mc += 2 * Math.PI;

  let asc = Math.atan2(-cosLst, sinLst * cosEps + Math.tan(phi) * sinEps);
  if (asc < 0) asc += 2 * Math.PI;
  let diff = ((asc - mc) + 2 * Math.PI) % (2 * Math.PI);
  if (diff > Math.PI) asc = (asc + Math.PI) % (2 * Math.PI);

  return {
    asc,
    mc,
    dsc: (asc + Math.PI) % (2 * Math.PI),
    ic: (mc + Math.PI) % (2 * Math.PI),
  };
}

export function getPlanetPositions(jd: number): PlanetPosition[] {
  const sun = solar.apparentEquatorialVSOP87(earth, jd);
  const moon = moonEquatorial(jd);
  const me = elliptic.position(mercury, earth, jd);
  const ve = elliptic.position(venus, earth, jd);
  const ma = elliptic.position(mars, earth, jd);
  const ju = elliptic.position(jupiter, earth, jd);
  const sa = elliptic.position(saturn, earth, jd);
  const ur = elliptic.position(uranus, earth, jd);
  const ne = elliptic.position(neptune, earth, jd);
  const pl = pluto.astrometric(jd, earth);

  const nn = meanNodeRaDec(jd, false);
  const sn = meanNodeRaDec(jd, true);
  const ch = minorBodyRaDec('Chiron', jd);
  const cr = minorBodyRaDec('Ceres', jd);
  const pa = minorBodyRaDec('Pallas', jd);
  const jn = minorBodyRaDec('Juno', jd);
  const vs = minorBodyRaDec('Vesta', jd);

  return [
    { name: 'Sun', ra: sun.ra, dec: sun.dec },
    { name: 'Moon', ra: moon.ra, dec: moon.dec },
    { name: 'Mercury', ra: me.ra, dec: me.dec },
    { name: 'Venus', ra: ve.ra, dec: ve.dec },
    { name: 'Mars', ra: ma.ra, dec: ma.dec },
    { name: 'Jupiter', ra: ju.ra, dec: ju.dec },
    { name: 'Saturn', ra: sa.ra, dec: sa.dec },
    { name: 'Uranus', ra: ur.ra, dec: ur.dec },
    { name: 'Neptune', ra: ne.ra, dec: ne.dec },
    { name: 'Pluto', ra: pl.ra, dec: pl.dec },
    { name: 'NorthNode', ra: nn.ra, dec: nn.dec },
    { name: 'SouthNode', ra: sn.ra, dec: sn.dec },
    { name: 'Chiron', ra: ch.ra, dec: ch.dec },
    { name: 'Ceres', ra: cr.ra, dec: cr.dec },
    { name: 'Pallas', ra: pa.ra, dec: pa.dec },
    { name: 'Juno', ra: jn.ra, dec: jn.dec },
    { name: 'Vesta', ra: vs.ra, dec: vs.dec },
  ];
}
