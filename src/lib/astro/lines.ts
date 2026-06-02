import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { PLANET_CODES, PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';
import { splitOnDateline } from './dateline';

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

export interface ZenithProps {
  planet: PlanetName;
  color: string;
}

// The zenith / sub-planetary point: the single spot on Earth where a planet is
// exactly overhead (altitude 90°). It sits on the planet's MC line, at the
// latitude equal to its declination, and longitude where local sidereal time
// equals the planet's RA — i.e. the same longitude as the MC line. One stamp per
// body, rendered as the planet glyph on the map.
export function generateZenithStamps(
  positions: PlanetPosition[],
  gmst: number,
): FeatureCollection<Point, ZenithProps> {
  const features: Feature<Point, ZenithProps>[] = positions.map((p) => ({
    type: 'Feature',
    // Stable per-body id so the map can drive a hover feature-state on each stamp.
    id: p.name,
    properties: { planet: p.name, color: PLANET_COLORS[p.name] },
    geometry: {
      type: 'Point',
      coordinates: [normLng((p.ra - gmst) * RAD2DEG), p.dec * RAD2DEG],
    },
  }));
  return { type: 'FeatureCollection', features };
}

