import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import {
  PLANET_CODES,
  PLANET_COLORS,
  eclipticToRaDec,
  obliquity,
  type PlanetName,
  type PlanetPosition,
} from '../ephemeris';
import { unwrapLongitudes } from './dateline';

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

// A body rises/sets only up to |lat| = 90 − |dec|; past that turning latitude it's
// circumpolar. We trace the curve to ±85° (the MC/IC extent and the Web-Mercator
// visible edge) and clip there — points beyond just exit the map edge.
const HORIZON_LAT_LIMIT = 85;
// Near-zero declination degenerates the rising/setting lines into two near-vertical
// meridians (turning latitude beyond ±85°, off-map) and makes the hour-angle
// latitude formula blow up. Below this |tan(dec)| (~2.9°) we fall back to the
// latitude sweep, which traces the vertical case cleanly and has no apex gap there.
const DEC_EPS = 0.05;
const HORIZON_H_STEP = 1 * DEG2RAD; // base hour-angle step
const HORIZON_MAX_DLAT_DEG = 1; // subdivide a step whose latitude jump exceeds this

function pushHorizonPoint(
  coords: [number, number][],
  lngDeg: number,
  latDeg: number,
): void {
  if (latDeg < -HORIZON_LAT_LIMIT || latDeg > HORIZON_LAT_LIMIT) return;
  coords.push([normLng(lngDeg), latDeg]);
}

// The rising/setting curve traced by LATITUDE (one longitude per latitude). Used
// only for near-zero-declination bodies, whose lines are essentially vertical and so
// have no high-latitude turning point to streak/break.
function horizonByLatitude(
  p: PlanetPosition,
  gmst: number,
  sign: -1 | 1,
): [number, number][] {
  const coords: [number, number][] = [];
  for (let lat = -HORIZON_LAT_LIMIT; lat <= HORIZON_LAT_LIMIT; lat += 0.5) {
    const phi = lat * DEG2RAD;
    const x = -Math.tan(phi) * Math.tan(p.dec);
    if (x < -1 || x > 1) continue;
    const H = sign * Math.acos(x);
    coords.push([normLng((p.ra + H - gmst) * RAD2DEG), lat]);
  }
  return coords;
}

// A planet's rising (ASC) or setting (DSC) line, traced by HOUR ANGLE H instead of
// by latitude. Both lng(H) = ra + H − gmst and lat(H) = atan(−cosH / tanDec) are
// smooth in H, so the curve is evenly, gap-free sampled everywhere — including the
// turning latitude |lat| = 90 − |dec|, where the latitude sweep's dH/dlat → ∞ drew a
// long horizontal streak and left a break between the two halves. We sweep H out from
// 0 (the south apex) to ∓π (ASC: −π, DSC: +π, the north apex) so latitude runs
// south→north as before (arrows keep their orientation); the halves share the apex
// (H=0) and nadir (H=±π) points exactly, so ASC and DSC meet with no gap. Each half is
// monotonic in latitude, so clipping to ±85° leaves one contiguous on-map run.
function horizonLine(
  p: PlanetPosition,
  gmst: number,
  side: 'ASC' | 'DSC',
): Feature<LineString, LineProps>[] {
  const tanDec = Math.tan(p.dec);
  if (Math.abs(tanDec) < DEC_EPS) {
    const sign = side === 'ASC' ? -1 : 1;
    return [
      makeFeature(unwrapLongitudes(horizonByLatitude(p, gmst, sign)), p.name, side),
    ];
  }

  const hDir = side === 'ASC' ? -1 : 1; // sweep H from 0 toward ∓π
  const latAt = (H: number) => Math.atan(-Math.cos(H) / tanDec) * RAD2DEG;
  const lngAt = (H: number) => (p.ra + H - gmst) * RAD2DEG;

  // Hour-angle magnitudes 0 … π, always including the exact apex endpoint π.
  const mags: number[] = [0];
  for (let m = HORIZON_H_STEP; m < Math.PI; m += HORIZON_H_STEP) mags.push(m);
  mags.push(Math.PI);

  const coords: [number, number][] = [];
  let prevLat = latAt(hDir * mags[0]);
  pushHorizonPoint(coords, lngAt(hDir * mags[0]), prevLat);
  for (let i = 1; i < mags.length; i++) {
    const H = hDir * mags[i];
    const lat = latAt(H);
    // Subdivide the step if latitude moved too fast (low-declination curves climb
    // steeply near H = ±90°), re-evaluating the curve at each sub-sample.
    const jumps = Math.max(
      1,
      Math.ceil(Math.abs(lat - prevLat) / HORIZON_MAX_DLAT_DEG),
    );
    for (let k = 1; k < jumps; k++) {
      const mk = mags[i - 1] + (mags[i] - mags[i - 1]) * (k / jumps);
      pushHorizonPoint(coords, lngAt(hDir * mk), latAt(hDir * mk));
    }
    pushHorizonPoint(coords, lngAt(H), lat);
    prevLat = lat;
  }
  // One continuous feature (longitudes may run past ±180 across the antimeridian).
  return [makeFeature(unwrapLongitudes(coords), p.name, side)];
}

// A meridian as a DENSE run of vertices (constant longitude, lat −85…85). The
// globe projection draws every line segment as a straight chord through the
// sphere, so a 2-point meridian would cut through the globe's interior instead of
// following its surface. Densifying lets MapLibre bend each short segment onto the
// surface — a true meridian on the globe, and an identical vertical line in flat
// 2D (the dense ASC/DSC curves and local-space arcs already satisfy this).
const MERIDIAN_LAT_MIN = -85;
const MERIDIAN_LAT_MAX = 85;
const GLOBE_STEP_DEG = 2;

function meridianCoords(lng: number): [number, number][] {
  const coords: [number, number][] = [];
  for (let lat = MERIDIAN_LAT_MIN; lat <= MERIDIAN_LAT_MAX; lat += GLOBE_STEP_DEG) {
    coords.push([lng, lat]);
  }
  return coords;
}

export function generateLines(
  positions: PlanetPosition[],
  gmst: number,
): FeatureCollection<LineString, LineProps> {
  const features: Feature<LineString, LineProps>[] = [];

  for (const p of positions) {
    const lngMC = normLng((p.ra - gmst) * RAD2DEG);
    const lngIC = normLng(lngMC + 180);
    features.push(makeFeature(meridianCoords(lngMC), p.name, 'MC'));
    features.push(makeFeature(meridianCoords(lngIC), p.name, 'IC'));
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

// The ecliptic (the Sun's apparent path / the zodiac great circle) projected onto
// Earth: the locus of zenith points of the ecliptic at this instant. Each ecliptic
// longitude λ (ecliptic latitude 0) maps to equatorial (RA, dec) via the obliquity
// ε, then to its sub-point with the SAME lng = RA − GMST, lat = dec convention as
// the zenith stamps — so the curve threads exactly through the Sun's zenith (the
// Sun rides the ecliptic) and near every other body's. Sampled densely and
// longitude-unwrapped so it bends onto the 3D globe instead of chording through it.
export function generateEcliptic(
  jd: number,
  gmst: number,
): FeatureCollection<LineString> {
  const eps = obliquity(jd);
  const coords: [number, number][] = [];
  for (let lonDeg = 0; lonDeg <= 360; lonDeg += GLOBE_STEP_DEG) {
    const { ra, dec } = eclipticToRaDec(lonDeg * DEG2RAD, 0, eps);
    coords.push([normLng((ra - gmst) * RAD2DEG), dec * RAD2DEG]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: unwrapLongitudes(coords) },
      },
    ],
  };
}

