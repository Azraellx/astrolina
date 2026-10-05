// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { Feature, FeatureCollection, LineString } from 'geojson';
import { PLANET_CODES, PLANET_COLORS, type PlanetName, type PlanetPosition } from '../ephemeris';
import { LINE_TYPE_LABEL, type MeridianLng } from './lines';

const RAD2DEG = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;

// Normalize an angle into [0, 2π) — the range ParanProps.theta is published in.
function norm2pi(x: number): number {
  return ((x % TWO_PI) + TWO_PI) % TWO_PI;
}

// Paran rows are listed only to ±72° latitude, while the angle lines themselves
// draw on to ±85°: rising/setting geometry degrades toward the circumpolar zone,
// so the high-latitude band deliberately shows line crossings without paran rows.
const PARAN_LAT_LIMIT = 72;

export interface ParanProps {
  planetA: PlanetName;
  // MC/IC for meridian × horizon parans; ASC/DSC when A is itself on the horizon
  // (horizon × horizon parans).
  angleA: 'MC' | 'IC' | 'ASC' | 'DSC';
  planetB: PlanetName;
  angleB: 'ASC' | 'DSC';
  latitude: number;
  intersectionLng: number;
  /** The pairing's shared LOCAL SIDEREAL TIME (radians, [0, 2π), equinox of
   *  date): the diurnal instant both bodies stand on their angles together,
   *  which holds at every longitude along the latitude (GMST + east-positive
   *  longitude = theta). Carried so a consumer can read the line in the time
   *  domain; frame-independent (the drawing frame only remaps longitudes). */
  theta: number;
  color: string;
  label: string;
  /** Overlay/promoted tag (e.g. "Tr"); absent for the natal chart. Shown as the
   *  paran badge's label prefix. */
  tag?: string;
  /** Fixed-star paran (report-only — never drawn as a map line): the star's
   *  name. The `label` carries the full star × planet pairing; planetA/planetB
   *  both hold the PLANET side so the planet-visibility filter keeps working. */
  star?: string;
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

// A paran is a full line of latitude (it holds at every longitude). The globe
// projection draws each line segment as a straight chord through the sphere, so a
// 2-point parallel from −180 to 180 would cut through the globe — and since those
// endpoints are the SAME point on the sphere, it can collapse entirely. Densifying
// into many short segments makes it wrap the globe as a true parallel, and renders
// as the same full-width horizontal line in flat 2D.
const PARALLEL_LNG_STEP_DEG = 3;

function parallelCoords(latDeg: number): [number, number][] {
  const coords: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += PARALLEL_LNG_STEP_DEG) {
    coords.push([lng, latDeg]);
  }
  return coords;
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
  if (!Number.isFinite(tanPhi)) return null;
  const phi = Math.atan(tanPhi);
  const latDeg = phi * RAD2DEG;
  if (latDeg < -PARAN_LAT_LIMIT || latDeg > PARAN_LAT_LIMIT) return null;
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

function horizonParans(
  a: { ra: number; dec: number },
  b: { ra: number; dec: number },
): HorizonParan[] {
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
    if (!Number.isFinite(tanPhi)) continue;
    const latDeg = Math.atan(tanPhi) * RAD2DEG;
    if (latDeg < -PARAN_LAT_LIMIT || latDeg > PARAN_LAT_LIMIT) continue;
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

// `meridianLng` is the SAME meridian→longitude mapping the drawn lines use
// (celestial: RA − GMST; geodetic: the zodiacal longitude), so the recorded
// intersection point — the paran badge's fly-to target — always lands where the
// drawn lines visibly cross the paran latitude, in either line system. The paran
// LATITUDES are frame-independent (the bodies' mutual hour-angle geometry
// survives the remapping); only this longitude metadata follows the frame.
export function generateParans(
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
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
        const intersectionLng = normLng(meridianLng(aRA));
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
            // A culminates when the local sidereal time equals its (IC-shifted) RA.
            theta: norm2pi(aRA),
            color: PLANET_COLORS[a.name],
            label: `${PLANET_CODES[a.name]} ${LINE_TYPE_LABEL[angleA]} × ${PLANET_CODES[b.name]} ${LINE_TYPE_LABEL[angleB]}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: parallelCoords(lat),
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
        const intersectionLng = normLng(meridianLng(sol.theta));
        features.push({
          type: 'Feature',
          properties: {
            planetA: a.name,
            angleA: sol.angleA,
            planetB: b.name,
            angleB: sol.angleB,
            latitude: sol.lat,
            intersectionLng,
            theta: norm2pi(sol.theta),
            color: PLANET_COLORS[a.name],
            label: `${PLANET_CODES[a.name]} ${LINE_TYPE_LABEL[sol.angleA]} × ${PLANET_CODES[b.name]} ${LINE_TYPE_LABEL[sol.angleB]}`,
          },
          geometry: {
            type: 'LineString',
            coordinates: parallelCoords(sol.lat),
          },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Fixed-star × planet parans — the Bernadette Brady school's signature
 * technique (a star rising as a planet culminates, and every other mundane
 * combination). Same closed forms as the planet parans, with the star's
 * equinox-of-date position on one side. These are not drawn as map lines: the
 * bright catalog times the planet set yields hundreds of latitude rows, which
 * would bury the map — and the conventional reading (Starlight, the ACG
 * latitude-crossing listings) is a per-location list anyway. Star-to-star
 * parans are not computed.
 *
 * `stars` should already reflect the active star set (and, in geodetic mode,
 * the ecliptic projection — match the star LINES' positions); `positions` the
 * visibility-filtered planet set. `color` is the shared starlight tint.
 */
export function generateStarParans(
  stars: { name: string; ra: number; dec: number }[],
  positions: PlanetPosition[],
  meridianLng: MeridianLng,
  color: string,
): FeatureCollection<LineString, ParanProps> {
  const features: Feature<LineString, ParanProps>[] = [];
  const push = (
    p: PlanetName,
    star: string,
    angleA: ParanProps['angleA'],
    angleB: ParanProps['angleB'],
    label: string,
    lat: number,
    intersectionLng: number,
    theta: number,
  ) =>
    features.push({
      type: 'Feature',
      properties: {
        planetA: p,
        angleA,
        planetB: p,
        angleB,
        latitude: lat,
        intersectionLng,
        theta: norm2pi(theta),
        color,
        label,
        star,
      },
      geometry: { type: 'LineString', coordinates: parallelCoords(lat) },
    });

  for (const s of stars) {
    for (const p of positions) {
      // Star culminating (MC/IC) while the planet rises or sets.
      for (const aOnIc of [false, true]) {
        const lat = paranLat(s.ra, p.ra, p.dec, aOnIc);
        if (lat === null) continue;
        const aRA = s.ra + (aOnIc ? Math.PI : 0);
        const hB = normalizeDelta(aRA - p.ra);
        const angleA = aOnIc ? ('IC' as const) : ('MC' as const);
        const angleB = hB < 0 ? ('ASC' as const) : ('DSC' as const);
        push(
          p.name, s.name, angleA, angleB,
          `★ ${s.name} ${LINE_TYPE_LABEL[angleA]} × ${PLANET_CODES[p.name]} ${LINE_TYPE_LABEL[angleB]}`,
          lat, normLng(meridianLng(aRA)), aRA,
        );
      }
      // Planet culminating while the star rises or sets.
      for (const aOnIc of [false, true]) {
        const lat = paranLat(p.ra, s.ra, s.dec, aOnIc);
        if (lat === null) continue;
        const aRA = p.ra + (aOnIc ? Math.PI : 0);
        const hB = normalizeDelta(aRA - s.ra);
        const angleA = aOnIc ? ('IC' as const) : ('MC' as const);
        const angleB = hB < 0 ? ('ASC' as const) : ('DSC' as const);
        push(
          p.name, s.name, angleA, angleB,
          `${PLANET_CODES[p.name]} ${LINE_TYPE_LABEL[angleA]} × ★ ${s.name} ${LINE_TYPE_LABEL[angleB]}`,
          lat, normLng(meridianLng(aRA)), aRA,
        );
      }
      // Both on the horizon together (the star listed first).
      for (const sol of horizonParans(s, p)) {
        push(
          p.name, s.name, sol.angleA, sol.angleB,
          `★ ${s.name} ${LINE_TYPE_LABEL[sol.angleA]} × ${PLANET_CODES[p.name]} ${LINE_TYPE_LABEL[sol.angleB]}`,
          sol.lat, normLng(meridianLng(sol.theta)), sol.theta,
        );
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

