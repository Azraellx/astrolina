import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_CODES, PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

export type LineType = 'MC' | 'IC' | 'ASC' | 'DSC';

export interface LineProps {
  planet: PlanetName;
  lineType: LineType;
  color: string;
  label: string;
}

function normLng(lng: number): number {
  let x = ((lng + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
}

function splitOnDateline(
  coords: [number, number][],
): [number, number][][] {
  const segs: [number, number][][] = [[]];
  for (const cur of coords) {
    const seg = segs[segs.length - 1];
    if (seg.length > 0) {
      const prev = seg[seg.length - 1];
      if (Math.abs(cur[0] - prev[0]) > 180) {
        segs.push([]);
      }
    }
    segs[segs.length - 1].push(cur);
  }
  return segs.filter((s) => s.length >= 2);
}

function makeFeature(
  coords: [number, number][],
  planet: PlanetName,
  lineType: LineType,
): Feature<LineString, LineProps> {
  return {
    type: 'Feature',
    properties: {
      planet,
      lineType,
      color: PLANET_COLORS[planet],
      label: `${PLANET_CODES[planet]} ${lineType}`,
    },
    geometry: { type: 'LineString', coordinates: coords },
  };
}

function horizonLine(
  p: PlanetPosition,
  gmst: number,
  side: 'ASC' | 'DSC',
): Feature<LineString, LineProps>[] {
  const sign = side === 'ASC' ? -1 : 1;
  const coords: [number, number][] = [];
  for (let lat = -72; lat <= 72; lat += 0.5) {
    const phi = lat * DEG2RAD;
    const x = -Math.tan(phi) * Math.tan(p.dec);
    if (x < -1 || x > 1) continue;
    const H = sign * Math.acos(x);
    const lng = normLng((p.ra + H - gmst) * RAD2DEG);
    coords.push([lng, lat]);
  }
  return splitOnDateline(coords).map((seg) => makeFeature(seg, p.name, side));
}

export function generateLines(
  positions: PlanetPosition[],
  gmst: number,
): FeatureCollection<LineString, LineProps> {
  const features: Feature<LineString, LineProps>[] = [];

  for (const p of positions) {
    const lngMC = normLng((p.ra - gmst) * RAD2DEG);
    const lngIC = normLng(lngMC + 180);
    features.push(makeFeature([[lngMC, -85], [lngMC, 85]], p.name, 'MC'));
    features.push(makeFeature([[lngIC, -85], [lngIC, 85]], p.name, 'IC'));
    features.push(...horizonLine(p, gmst, 'ASC'));
    features.push(...horizonLine(p, gmst, 'DSC'));
  }

  return { type: 'FeatureCollection', features };
}

