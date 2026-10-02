// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What the map's own GeoJSON sources hand MapLibre's tiler (@maplibre/geojson-vt): the tile
// options each source is created with, and the Slide tool's rigid rotation of their geometry.
// Apart from Map.tsx so scripts/verify-slide.ts can tile exactly what the map tiles — the same
// options and the same translate, not a restatement of either.
import type { Feature, FeatureCollection, Geometry } from 'geojson';

// Tile options for the line / paran / zenith sources. The buffer makes neighbouring
// tiles overlap so an antimeridian-crossing line has no hairline seam at the ±180°
// world boundary (geojson-vt wraps the out-of-range longitudes into the adjacent
// world copy; the overlap hides the join), and tolerance is geojson-vt's per-zoom
// line simplification. Both are tuned for render cost: an earlier {512, 0} kept
// every vertex of every line in maximal-overlap tiles, which made low zooms — where
// the world copies multiply the geometry — disproportionately expensive to tile and
// tessellate. 128/0.375 (the geojson-vt defaults) render visually identical output,
// including the ±180° crossing at world zoom. Before touching these again, re-check
// the seam: centre on lng 180 with every line overlay on and screenshot z1/z2/z4 in
// 2D and tilted 3D — any gap, kink, or dash-phase jump at the join is a regression.
export const LINE_SOURCE_OPTS = { buffer: 128, tolerance: 0.375 } as const;
// Parans (and their orb-zone fills) are the exception: a paran is a perfect parallel
// of latitude, so its densified geometry (parallelCoords in parans.ts; the constant-
// latitude top/bottom edges of paranRing in orbBands.ts) is PERFECTLY collinear in
// lng/lat. geojson-vt's tolerance simplification then strips every interior vertex,
// collapsing the parallel back to one −180→180 span — whose 360° longitude jump it
// mis-handles at the antimeridian, so it gets clipped off near the world centre when
// zoomed far out (2D) and can collapse through the globe (3D). The densification
// exists precisely to avoid that, so these sources keep the same seam buffer but
// disable simplification. (Re-run the ±180° seam check from LINE_SOURCE_OPTS if you
// touch this.)
export const PARAN_SOURCE_OPTS = { buffer: 128, tolerance: 0 } as const;
// The translucent WASHES — the night shade and the orb zones — take no buffer. (The orb
// zones keep the paran options' tolerance 0 for the paran bands among them; the curved
// line bands there survive 0.375 fine, so the only cost is keeping their vertices too —
// acceptable for an off-by-default fill; split the paran bands into their own source if
// low-zoom orb perf ever bites.) The buffer
// exists for line joins, and a fill drawn with fill-antialias off (both are) has no
// edge for a seam to show in. On the globe it did harm: below zoom 1 the single z0 tile's
// buffered geometry reaches about 90° past ±180°, and the globe drapes that overhang
// round the sphere unclipped — so a band about 90° wide near the antimeridian took two
// layers of shade. A phone showing the whole globe is already on z0. The `eclipse` source
// keeps the line buffer: it carries the eclipse's curves too, in one mixed source.
// (128 is also MapLibre's own default, so the buffer has to be 0 explicitly — leaving
// the option out changes nothing.) The ±180° seam check above applies here too.
export const WASH_SOURCE_OPTS = { buffer: 0, tolerance: 0.375 } as const;
export const BAND_SOURCE_OPTS = { buffer: 0, tolerance: 0 } as const;

/** A Slide spin angle as the map RENDERS it: folded into (−180, 180]. The spin itself stays
 *  unwrapped — it IS the elapsed time (θ / sidereal rate), and a spin of several days is a
 *  real reading — but the camera centre and the rotated linework only ever need θ modulo a
 *  turn, and fed the raw angle the linework vanished (see translateLng). */
export function wrapSpin(deg: number): number {
  const w = ((((deg + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
}

// The longitude of a geometry's first vertex, or null for one with none.
function firstLng(g: Geometry | null): number | null {
  switch (g?.type) {
    case 'Point':
      return g.coordinates[0] ?? null;
    case 'LineString':
      return g.coordinates[0]?.[0] ?? null;
    case 'MultiLineString':
    case 'Polygon':
      return g.coordinates[0]?.[0]?.[0] ?? null;
    case 'MultiPolygon':
      return g.coordinates[0]?.[0]?.[0]?.[0] ?? null;
    default:
      return null;
  }
}

/**
 * Rigidly rotate a geometry collection about the polar axis by shifting every vertex's
 * longitude by `dLng`. The generators emit antimeridian-continuous coordinates (see
 * unwrapLongitudes), so a constant offset keeps each feature unbroken.
 *
 * What a constant offset must NOT do is carry them far out of range. The globe would
 * wrap any longitude onto the sphere, and MapLibre's camera copes with any centre (its
 * tiles wrap whole worlds), but the GeoJSON tiler does not: geojson-vt folds in only one
 * world copy either side of the main one — longitudes of about −540…+540 — and silently
 * drops whatever lies beyond. The Slide spin used to arrive here unwrapped, and past a day
 * or two of slide every pinned line was gone over a basemap that kept drawing (measured
 * with the line sources' own options: 30 features at 0°, 19 at 540°, 8 at 600°, 0 at 800°).
 *
 * So callers pass a wrapped angle (wrapSpin), which keeps every vertex within ±180° of where
 * it was generated; and with `tiled` set — the data handed to a source — each feature is also
 * moved by the whole turn that brings its first vertex back into −180…180, which puts every
 * vertex inside the fold whatever its generator did past ±180. That turn is invisible: a
 * flat map draws the same tiles in every world copy, and the globe has only the one. It is
 * NOT applied to coordinates the caller projects itself (the badge anchoring), where a
 * feature a world away from its neighbours — the Local Space lines from their origin —
 * would project a world away on a flat map.
 */
export function translateLng(fc: FeatureCollection, dLng: number, tiled = false): FeatureCollection {
  if (dLng === 0) return fc;
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f): Feature => {
      const g = f.geometry;
      const first = firstLng(g);
      if (first === null) return f;
      const d = tiled ? dLng - 360 * Math.round((first + dLng) / 360) : dLng;
      const ring = (pts: number[][]) => pts.map((c) => [c[0] + d, c[1]]);
      switch (g.type) {
        case 'LineString':
          return { ...f, geometry: { type: 'LineString', coordinates: ring(g.coordinates) } };
        case 'MultiLineString':
          return { ...f, geometry: { type: 'MultiLineString', coordinates: g.coordinates.map(ring) } };
        case 'Polygon':
          return { ...f, geometry: { type: 'Polygon', coordinates: g.coordinates.map(ring) } };
        case 'MultiPolygon':
          return {
            ...f,
            geometry: { type: 'MultiPolygon', coordinates: g.coordinates.map((poly) => poly.map(ring)) },
          };
        case 'Point':
          return { ...f, geometry: { type: 'Point', coordinates: [g.coordinates[0] + d, g.coordinates[1]] } };
        default:
          return f;
      }
    }),
  };
}
