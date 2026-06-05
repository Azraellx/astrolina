// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Keep a polyline's longitudes CONTINUOUS across the ±180° antimeridian.
//
// A line generated in normalized [-180,180] longitudes snaps from +179° to −179°
// when it crosses the seam, which a flat renderer would either draw as a full-width
// streak or (if split into two features) leave with a visible break when zoomed all
// the way out. Instead we walk the line and, on each >180° longitude jump, shift a
// running offset by ∓360° so the output longitudes flow PAST ±180 rather than
// wrapping. The result is one unbroken LineString: MapLibre tiles it seamlessly via
// renderWorldCopies (the mercator default), and the globe wraps the out-of-range
// longitudes onto the sphere natively. So one continuous feature works in both 2D
// and 3D — no split, no seam.
export function unwrapLongitudes(
  coords: [number, number][],
): [number, number][] {
  if (coords.length === 0) return coords;
  const out: [number, number][] = [coords[0]];
  let offset = 0;
  for (let i = 1; i < coords.length; i++) {
    const delta = coords[i][0] - coords[i - 1][0];
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    out.push([coords[i][0] + offset, coords[i][1]]);
  }
  return out;
}
