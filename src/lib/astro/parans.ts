import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_CODES, PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';

const RAD2DEG = 180 / Math.PI;

export interface ParanProps {
  planetA: PlanetName;
  // MC/IC for meridian × horizon parans; ASC/DSC when A is itself on the horizon
  // (horizon × horizon parans).
  angleA: 'MC' | 'IC' | 'ASC' | 'DSC';
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

// Horizon × horizon paran: both planets on the horizon at the same instant.
// Each is on the horizon when cos(H) = −tan(dec)·tan(φ), with hour angle
// H = θ − ra (θ = local sidereal time). Eliminating φ gives
// cos(θ − raA) = k·cos(θ − raB), k = tan(decA)/tan(decB), which is linear in
// (cos θ, sin θ) → two sidereal times a half-turn apart. Each yields one
// latitude and a rising/setting (ASC/DSC) state per planet. Closed form, so no
// root-finding is needed.
interface HorizonParan {
  lat: number;
  theta: number;
  angleA: 'ASC' | 'DSC';
  angleB: 'ASC' | 'DSC';
}

function horizonParans(a: PlanetPosition, b: PlanetPosition): HorizonParan[] {
  const tanDecA = Math.tan(a.dec);
  const tanDecB = Math.tan(b.dec);
  // A body on the equator only ever touches the horizon at H = ±90°, which the
  // elimination degenerates on; skip those rare pairs (matches the meridian case).
  if (Math.abs(tanDecA) < 1e-6 || Math.abs(tanDecB) < 1e-6) return [];
  const k = tanDecA / tanDecB;
  const num = -(Math.cos(a.ra) - k * Math.cos(b.ra));
  const den = Math.sin(a.ra) - k * Math.sin(b.ra);
  if (Math.abs(num) < 1e-12 && Math.abs(den) < 1e-12) return [];
  const theta0 = Math.atan2(num, den);

  const out: HorizonParan[] = [];
  for (const theta of [theta0, theta0 + Math.PI]) {
    const tanPhi = -Math.cos(theta - a.ra) / tanDecA;
    if (!Number.isFinite(tanPhi) || Math.abs(tanPhi) > 6) continue;
    const latDeg = Math.atan(tanPhi) * RAD2DEG;
    if (latDeg < -72 || latDeg > 72) continue;
    const hA = normalizeDelta(theta - a.ra);
    const hB = normalizeDelta(theta - b.ra);
    out.push({
      lat: latDeg,
      theta,
      angleA: hA < 0 ? 'ASC' : 'DSC',
      angleB: hB < 0 ? 'ASC' : 'DSC',
    });
  }
  return out;
}

export function generateParans(
  positions: PlanetPosition[],
  gmst: number,
): FeatureCollection<LineString, ParanProps> {
  const features: Feature<LineString, ParanProps>[] = [];

  // Meridian × horizon: planet A on MC/IC while planet B is on the horizon.
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

  // Horizon × horizon: both planets on the horizon together. Unordered pairs
  // (i < j) since the configuration is symmetric; each pair yields up to two
  // parans (the two sidereal-time solutions, at mirrored latitudes).
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i];
      const b = positions[j];
      for (const sol of horizonParans(a, b)) {
        const intersectionLng = normLng((sol.theta - gmst) * RAD2DEG);
        features.push({
          type: 'Feature',
          properties: {
            planetA: a.name,
            angleA: sol.angleA,
            planetB: b.name,
            angleB: sol.angleB,
            latitude: sol.lat,
            intersectionLng,
            color: PLANET_COLORS[a.name],
            label: `${PLANET_CODES[a.name]} ${sol.angleA} × ${PLANET_CODES[b.name]} ${sol.angleB}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [-180, sol.lat],
              [180, sol.lat],
            ],
          },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

