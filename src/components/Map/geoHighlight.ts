// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// What the geodetic hover lights under the cursor (2026-10-20). Lina, 20 Oct 2026, §4: the
// highlight follows the grid's switches —
//
//   MC meridians only   the MC band under the cursor
//   Ascendant curves    the Ascendant zone under it
//   both                both, each fainter, so where they overlap the two washes stack darker
//   neither             nothing (the readout still shows)
//
// Until then the Ascendant zone lit whatever was switched on, an MC band never. Kept apart from
// Map.tsx, which imports the map engine, so verify-geodetic can hold the four cases to the
// readout itself: each lit feature is the band or zone of the readout's OWN sign, never a
// polygon hit-test — the highlight and the readout can't disagree anywhere.
import { geoZoneId, type GeoReadoutAngles } from '../../lib/astro/geodeticGrid';

/** The feature-state ids to light (geoZoneId), or null for none, and whether each is lit faint. */
export interface GeoHighlight {
  mc: number | null;
  asc: number | null;
  faint: boolean;
}

/**
 * The highlight for a readout, given which of the two lit layers have data on the map — the MC
 * bands while the meridians are drawn, the Ascendant zones while the curves are and their build
 * has finished. Faint only while both are drawn. Within 0.01° of a pole the readout has no AS,
 * and no zone is lit there.
 */
export function geoHighlightFor(
  readout: Pick<GeoReadoutAngles, 'as' | 'mc'> | null,
  drawn: { mc: boolean; asc: boolean },
): GeoHighlight {
  return {
    mc: readout && drawn.mc ? geoZoneId(readout.mc.signIdx) : null,
    asc: readout?.as && drawn.asc ? geoZoneId(readout.as.signIdx) : null,
    faint: drawn.mc && drawn.asc,
  };
}
