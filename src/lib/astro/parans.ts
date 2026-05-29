import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_CODES, PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';

const RAD2DEG = 180 / Math.PI;

export interface ParanProps {
  planetA: PlanetName;
  angleA: 'MC' | 'IC';
  planetB: PlanetName;
  angleB: 'ASC' | 'DSC';
  latitude: number;
  intersectionLng: number;
  color: string;
  label: string;
}

function normalizeDelta(rad: number): number {
  let x = rad;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

function normLng(lng: number): number {
  let x = ((lng + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function paranLat(
  raA: number,
  raB: number,
  decB: number,
  aOnIc: boolean,
): number | null {
  const dAlpha = normalizeDelta(raA - raB);
  const sign = aOnIc ? 1 : -1;
  const tanD = Math.tan(decB);
  if (Math.abs(tanD) < 1e-6) return null;
  const tanPhi = (sign * Math.cos(dAlpha)) / tanD;
  if (!Number.isFinite(tanPhi) || Math.abs(tanPhi) > 6) return null;
  const phi = Math.atan(tanPhi);
  const latDeg = phi * RAD2DEG;
  if (latDeg < -72 || latDeg > 72) return null;
  return latDeg;
}

export function generateParans(
  positions: PlanetPosition[],
  gmst: number,
): FeatureCollection<LineString, ParanProps> {
  const features: Feature<LineString, ParanProps>[] = [];

  for (const a of positions) {
    for (const b of positions) {
      if (a.name === b.name) continue;
      for (const aOnIc of [false, true]) {
        const lat = paranLat(a.ra, b.ra, b.dec, aOnIc);
        if (lat === null) continue;
        const aRA = a.ra + (aOnIc ? Math.PI : 0);
        const intersectionLng = normLng((aRA - gmst) * RAD2DEG);
        const hB = normalizeDelta(aRA - b.ra);
        const angleB: 'ASC' | 'DSC' = hB < 0 ? 'ASC' : 'DSC';

        const angleA: 'MC' | 'IC' = aOnIc ? 'IC' : 'MC';
        features.push({
          type: 'Feature',
          properties: {
            planetA: a.name,
            angleA,
            planetB: b.name,
            angleB,
            latitude: lat,
            intersectionLng,
            color: PLANET_COLORS[a.name],
            label: `${PLANET_CODES[a.name]} ${angleA} × ${PLANET_CODES[b.name]} ${angleB}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-180, lat],
              [180, lat],
            ],
          },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

