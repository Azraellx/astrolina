import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;
const EARTH_R_KM = 6371;
const HALF_EARTH_KM = Math.PI * EARTH_R_KM;

export interface LocalSpaceProps {
  planet: PlanetName;
  azimuth: number;
  color: string;
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

function splitOnDateline(
  coords: [number, number][],
): [number, number][][] {
  const segs: [number, number][][] = [[]];
  for (const cur of coords) {
    const seg = segs[segs.length - 1];
    if (seg.length > 0 && Math.abs(cur[0] - seg[seg.length - 1][0]) > 180) {
      segs.push([]);
    }
    segs[segs.length - 1].push(cur);
  }
  return segs.filter((s) => s.length >= 2);
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
    for (const bearing of [az, (az + Math.PI) % (2 * Math.PI)]) {
      const arc = greatCircleArc(
        birthLat,
        birthLng,
        bearing,
        HALF_EARTH_KM * 0.995,
        80,
      );
      for (const seg of splitOnDateline(arc)) {
        features.push({
          type: 'Feature',
          properties: {
            planet: p.name,
            azimuth: az * RAD2DEG,
            color: PLANET_COLORS[p.name],
          },
          geometry: { type: 'LineString', coordinates: seg },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}
