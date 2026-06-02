import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';
import { unwrapLongitudes } from './dateline';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const EARTH_R_KM = 6371;
const HALF_EARTH_KM = Math.PI * EARTH_R_KM;

export interface LocalSpaceProps {
  planet: PlanetName;
  /** Degrees clockwise from north toward the planet (the 'out' half's bearing). */
  azimuth: number;
  color: string;
  /** 'out' = the half running toward the planet; 'in' = the opposite half. */
  direction: 'out' | 'in';
  /** The planet's zenith (sub-planetary) point — on its MC line, and on this
   *  line (the azimuth is the bearing to it). The LS label's click-to-fly target. */
  zenithLng: number;
  zenithLat: number;
}

function azimuthFromNorth(
  ra: number,
  dec: number,
  lst: number,
  latRad: number,
): number {
  const H = lst - ra;
  const az = Math.atan2(
    -Math.sin(H),
    Math.tan(dec) * Math.cos(latRad) - Math.cos(H) * Math.sin(latRad),
  );
  return (az + 2 * Math.PI) % (2 * Math.PI);
}

function normLng(lng: number): number {
  let x = ((lng + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function greatCircleArc(
  lat0Deg: number,
  lng0Deg: number,
  bearingRad: number,
  arcKm: number,
  steps: number,
): [number, number][] {
  const phi1 = lat0Deg * DEG2RAD;
  const lam1 = lng0Deg * DEG2RAD;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const d = (i / steps) * arcKm;
    const delta = d / EARTH_R_KM;
    const sinPhi = Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(bearingRad);
    const phi2 = Math.asin(sinPhi);
    const lam2 =
      lam1 +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(delta) * Math.cos(phi1),
        Math.cos(delta) - Math.sin(phi1) * sinPhi,
      );
    coords.push([normLng(lam2 * RAD2DEG), phi2 * RAD2DEG]);
  }
  return coords;
}

export function generateLocalSpace(
  positions: PlanetPosition[],
  gmst: number,
  birthLat: number,
  birthLng: number,
): FeatureCollection<LineString, LocalSpaceProps> {
  const features: Feature<LineString, LocalSpaceProps>[] = [];
  const lst =
    (gmst + birthLng * DEG2RAD + 2 * Math.PI) % (2 * Math.PI);
  const latRad = birthLat * DEG2RAD;

  for (const p of positions) {
    const az = azimuthFromNorth(p.ra, p.dec, lst, latRad);
    const zenithLng = normLng((p.ra - gmst) * RAD2DEG);
    const zenithLat = p.dec * RAD2DEG;
    const halves: { bearing: number; direction: 'out' | 'in' }[] = [
      { bearing: az, direction: 'out' },
      { bearing: (az + Math.PI) % (2 * Math.PI), direction: 'in' },
    ];
    for (const { bearing, direction } of halves) {
      const arc = greatCircleArc(
        birthLat,
        birthLng,
        bearing,
        HALF_EARTH_KM * 0.995,
        80,
      );
      // One continuous feature (longitudes may run past ±180 across the seam).
      features.push({
        type: 'Feature',
        properties: {
          planet: p.name,
          azimuth: az * RAD2DEG,
          color: PLANET_COLORS[p.name],
          direction,
          zenithLng,
          zenithLat,
        },
        geometry: { type: 'LineString', coordinates: unwrapLongitudes(arc) },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}
