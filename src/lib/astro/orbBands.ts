// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Orb-of-influence bands: a translucent zone around each planet angle line (a
// GROUND distance, so the band is geodesically honest at every latitude and in
// both projections — a px-width halo would lie at high latitudes) and a
// latitude band around each paran (parans carry their orb in degrees of
// latitude by convention). Rendered as fill polygons under the line layers.
//
// Geometry rides the lines' own (possibly ±180-unwrapped) longitude frame: the
// perpendicular offset is computed as a Δlongitude and ADDED to the vertex's
// longitude, so a band stays continuous across the seam exactly like its line.
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import type { LineProps } from './lines';
import type { ParanProps } from './parans';

const R_KM = 6371;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// The offset distance is clamped so a band edge can never reach past this
// latitude: an offset crossing the pole flips its computed Δlongitude by
// ~180°, breaking the unwrapped frame and folding the ring into a bogus
// polar fill. Clamping the distance instead of dropping vertices keeps the
// band continuous — it just pinches as the line nears a pole (a horizon
// line's apex sits at 90−|dec|, well inside reach of a wide user orb).
const POLE_CUTOFF_LAT = 88.5;
const KM_PER_DEG = 111.2;

export interface OrbBandProps {
  color: string;
  opacity: number;
}

type Pt = [number, number]; // GeoJSON [lng, lat]

// Destination point at `km` along `bearing` (radians, from north) — Δλ comes
// straight out of the formula, so the unwrapped frame is preserved.
function offset(p: Pt, bearing: number, km: number): Pt {
  const d = km / R_KM;
  const phi1 = p[1] * D2R;
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(bearing);
  const dLng = Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(phi1),
    Math.cos(d) - Math.sin(phi1) * sinPhi2,
  );
  return [p[0] + dLng * R2D, Math.asin(sinPhi2) * R2D];
}

// Initial great-circle bearing a→b (radians). The unwrapped frame's Δλ is the
// plain difference.
function bearing(a: Pt, b: Pt): number {
  const phi1 = a[1] * D2R;
  const phi2 = b[1] * D2R;
  const dLng = (b[0] - a[0]) * D2R;
  return Math.atan2(
    Math.sin(dLng) * Math.cos(phi2),
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng),
  );
}

const HALF_PI = Math.PI / 2;

// One line's band: every vertex offset `orbKm` to each side, perpendicular to
// the local line direction; left side forward + right side reversed close the
// ring. Vertices hugging a pole are dropped (the band simply ends early there).
function bandRing(coords: Pt[], orbKm: number): Pt[] | null {
  const usable = coords.filter((c) => Math.abs(c[1]) < POLE_CUTOFF_LAT);
  if (usable.length < 2) return null;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < usable.length; i++) {
    const a = usable[Math.max(0, i - 1)];
    const b = usable[Math.min(usable.length - 1, i + 1)];
    const dir = bearing(a, b);
    // Per-vertex clamp: never offset farther than the cutoff latitude allows
    // (see POLE_CUTOFF_LAT above — past the pole the ring folds).
    const km = Math.min(
      orbKm,
      Math.max(0, (POLE_CUTOFF_LAT - Math.abs(usable[i][1])) * KM_PER_DEG),
    );
    left.push(offset(usable[i], dir - HALF_PI, km));
    right.push(offset(usable[i], dir + HALF_PI, km));
  }
  right.reverse();
  const ring = [...left, ...right];
  ring.push(ring[0]);
  return ring;
}

// Paran bands span every longitude; 5° steps keep the edges smooth on the globe.
const PARAN_LNG_STEP = 5;

function paranRing(latitude: number, orbDeg: number): Pt[] {
  const top = Math.min(latitude + orbDeg, 89);
  const bottom = Math.max(latitude - orbDeg, -89);
  const ring: Pt[] = [];
  for (let lng = -180; lng <= 180; lng += PARAN_LNG_STEP) ring.push([lng, top]);
  for (let lng = 180; lng >= -180; lng -= PARAN_LNG_STEP) ring.push([lng, bottom]);
  ring.push(ring[0]);
  return ring;
}

const LINE_BAND_OPACITY = 0.07;
const PARAN_BAND_OPACITY = 0.045;

/**
 * The combined orb-zone fill set: one polygon per planet angle line (`orbKm`
 * ground distance each side) and one latitude band per paran (`paranOrbDeg`
 * each side). Both inputs are the already-filtered map collections, so the
 * zones always mirror what's visible.
 */
export function generateOrbBands(
  lines: FeatureCollection<LineString, LineProps>,
  parans: FeatureCollection<LineString, ParanProps>,
  orbKm: number,
  paranOrbDeg: number,
): FeatureCollection<Polygon, OrbBandProps> {
  const features: Feature<Polygon, OrbBandProps>[] = [];
  if (orbKm > 0) {
    for (const f of lines.features) {
      const ring = bandRing(f.geometry.coordinates as Pt[], orbKm);
      if (!ring) continue;
      features.push({
        type: 'Feature',
        properties: { color: f.properties.color, opacity: LINE_BAND_OPACITY },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
  }
  if (paranOrbDeg > 0) {
    // Several parans can share one latitude (node merges aside); collapse them
    // so stacked identical bands don't multiply the fill.
    const seen = new Set<string>();
    for (const f of parans.features) {
      const key = `${f.properties.latitude.toFixed(3)}|${f.properties.color}`;
      if (seen.has(key)) continue;
      seen.add(key);
      features.push({
        type: 'Feature',
        properties: { color: f.properties.color, opacity: PARAN_BAND_OPACITY },
        geometry: { type: 'Polygon', coordinates: [paranRing(f.properties.latitude, paranOrbDeg)] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
