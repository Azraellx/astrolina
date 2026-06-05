// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Projection-aware screen geometry — the single home for "where/which-way does a
// geographic point sit on screen under the CURRENT projection". Overlays call
// these instead of baking in flat-Mercator assumptions (north-is-up, nothing
// hidden), so they stay correct when the map is a rotated/tilted 3D globe.
//
// Every function has a mercator fast-path, so in 2D the results are identical to
// the old hand-rolled math (screenAngleOfNorth → 0, isOccluded → false). This is
// also the place future overlays should reach for, so globe-correctness lives in
// one module rather than being re-derived per feature.
import maplibregl, { LngLat } from 'maplibre-gl';

// True iff the map is currently drawn as a 3D globe (vs. flat mercator).
function isGlobe(map: maplibregl.Map): boolean {
  return map.getProjection().type === 'globe';
}

/**
 * True iff (lng,lat) is hidden behind the globe. Always false in mercator/2D
 * (MapLibre's `MercatorTransform.isLocationOccluded` returns false), so callers
 * may invoke this unconditionally — it's a no-op cost in 2D.
 */
export function isOccluded(
  map: maplibregl.Map,
  lng: number,
  lat: number,
): boolean {
  // `isLocationOccluded` is the method MapLibre itself uses to hide Markers/Popups
  // on the globe's far side. It's typed but carries an @internal note, so we reach
  // it defensively and fall back to our own cap test if it ever disappears.
  const t = map.transform as unknown as {
    isLocationOccluded?: (ll: LngLat) => boolean;
  };
  if (typeof t.isLocationOccluded === 'function') {
    return t.isLocationOccluded(new LngLat(lng, lat));
  }
  return occludedFallback(map, lng, lat);
}

// Spherical-cap fallback: a point is on the far side when its angular distance
// from the screen centre exceeds the visible horizon (~84.5° at world view).
// Approximate (ignores camera distance/pitch), but only ever runs if the public
// method is gone.
function occludedFallback(map: maplibregl.Map, lng: number, lat: number): boolean {
  if (!isGlobe(map)) return false;
  const c = map.getCenter();
  const d = Math.PI / 180;
  const unit = (la: number, lo: number): [number, number, number] => {
    const cl = Math.cos(la * d);
    return [cl * Math.cos(lo * d), cl * Math.sin(lo * d), Math.sin(la * d)];
  };
  const a = unit(c.lat, c.lng);
  const b = unit(lat, lng);
  const cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return cos < 0.0958; // ≈ cos(84.5°)
}

/**
 * Screen-space angle (radians, 0 = up, increasing clockwise) of the local north
 * direction at (lng,lat). Returns 0 in mercator (north is screen-up). On a globe
 * it projects a tiny step north and measures the on-screen heading, so it stays
 * correct under rotation, tilt and the globe's curvature.
 */
export function screenAngleOfNorth(
  map: maplibregl.Map,
  lng: number,
  lat: number,
): number {
  if (!isGlobe(map)) return 0;
  const a = map.project([lng, lat]);
  const b = map.project([lng, Math.min(lat + 0.05, 89.9)]);
  // Screen +y points down; (dx, -dy) puts 0 at up and grows clockwise.
  return Math.atan2(b.x - a.x, -(b.y - a.y));
}

/** project + finite + within the viewport (optional inset) + not occluded. */
export function isPointVisible(
  map: maplibregl.Map,
  lng: number,
  lat: number,
  inset = 0,
): boolean {
  if (isOccluded(map, lng, lat)) return false;
  const p = map.project([lng, lat]);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  const c = map.getContainer();
  return (
    p.x >= inset &&
    p.y >= inset &&
    p.x <= c.clientWidth - inset &&
    p.y <= c.clientHeight - inset
  );
}

/** project, but return null for occluded / non-finite (off-globe) points. */
export function projectVisible(
  map: maplibregl.Map,
  lng: number,
  lat: number,
): { x: number; y: number } | null {
  if (isOccluded(map, lng, lat)) return null;
  const p = map.project([lng, lat]);
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}
