// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The geodetic grid's sign glyphs (lib/astro/geodeticGrid): one at the top of each MC band, and
// one on each Ascendant curve where it leaves the view and where it crosses the equator — the
// sign that BEGINS there in both cases.
//
// DOM chips in the label layer rather than glyphs baked into the map's sprites (2026-10-02):
// the map's font has no zodiac glyphs, so a GL label would need a sprite per sign re-baked per
// theme, and would be blind to the panels and to every other label. As DOM they are the same
// ZodiacGlyph the Coordinates box draws, they keep off the panels, the markers and every other
// label through the one occupancy (chipOccupancy.ts), and a capture rasterises them as they
// are on screen. They rank last of all (CHIP_RANK.grid): a glyph with no clear spot is not
// drawn rather than drawn over something the reader asked for.
import type maplibregl from 'maplibre-gl';
import { geoGrid } from '../../lib/astro/geodeticGrid';
import { projectVisible } from '../../lib/mapProjection';
import {
  CHIP_RANK,
  CHIP_SLIDE_CAP,
  placeOnPath,
  type ChipOccupancy,
  type ChipPt,
} from './chipOccupancy';
import { lineEndGroups, lngToVisibleCopy } from './edgeAnchors';

// Half-extents of a glyph chip (a 12 px glyph with its halo, no pill).
export const GEO_GRID_CHIP = { hw: 7, hh: 7 } as const;

export interface GeoGridBadge {
  key: string;
  x: number;
  y: number;
  /** 0 (Aries) … 11 (Pisces). */
  sign: number;
  /** Where it stacks among all the map's labels (chipStack, from the occupancy). */
  z: number;
}

// A run end within this of the inset view's edge is where the line LEAVES the view — the
// clip puts it exactly there, give or take float — rather than a curve's own end inside it.
const EDGE_PX = 1;

/**
 * Place the grid's glyphs for this pass, after every other kind of label: the MC bands' first
 * (`bands`), then each Ascendant curve's exits, then its equator crossings (`curves`). Each on
 * its own line (placeOnPath), and only where it lands clear; nothing is ever overlapped.
 */
export function placeGeoGridChips(
  map: maplibregl.Map,
  which: { bands: boolean; curves: boolean },
  occupancy: () => ChipOccupancy,
  inset: number,
): GeoGridBadge[] {
  const out: GeoGridBadge[] = [];
  if (!which.bands && !which.curves) return out;
  const { hw, hh } = GEO_GRID_CHIP;
  const grid = geoGrid();
  // `near`: the spot must stay within the slide cap of the anchor — for an anchor that is not
  // one of the run's own ends (the equator point), which could otherwise send the glyph far
  // along a run it was never on.
  const place = (key: string, sign: number, path: ChipPt[], anchor: ChipPt, near = false) => {
    const occ = occupancy();
    const spot = placeOnPath(occ, path, anchor, hw, hh, inset);
    if (!spot || !spot.clear) return;
    if (near && Math.hypot(spot.x - anchor.x, spot.y - anchor.y) > CHIP_SLIDE_CAP) return;
    out.push({ key, x: spot.x, y: spot.y, sign, z: occ.add(spot.x, spot.y, hw, hh, CHIP_RANK.grid) });
  };

  if (which.bands) {
    // The band-centre meridian's visible run, from its TOP end: the glyph reads as the band's
    // name at the head of the map, and placeOnPath steps it down off the top nav.
    const groups = lineEndGroups(map, grid.mcLabelLines.features, inset, (p) => ({
      key: `mc${p.sign}`,
      meta: p.sign,
    }));
    groups.forEach(({ meta: sign, bestEnds, bestLine }) => {
      const top = bestEnds.reduce((a, b) => (b.y < a.y ? b : a));
      place(`geo-mc-${sign}`, sign, bestLine, top);
    });
  }

  if (which.curves) {
    const cont = map.getContainer();
    const w = cont.clientWidth;
    const h = cont.clientHeight;
    const groups = lineEndGroups(map, grid.asc.features, inset, (p) => ({
      key: `asc${p.sign}`,
      meta: p.sign,
    }));
    const onEdge = (p: ChipPt) =>
      Math.abs(p.x - inset) <= EDGE_PX ||
      Math.abs(p.x - (w - inset)) <= EDGE_PX ||
      Math.abs(p.y - inset) <= EDGE_PX ||
      Math.abs(p.y - (h - inset)) <= EDGE_PX;
    // Every curve's exits before any equator point: a curve's name at the edge of the view is
    // what tells a reader which line they are following in from off screen.
    groups.forEach(({ meta: sign, bestEnds, bestLine }) => {
      bestEnds.forEach((pt, i) => {
        if (onEdge(pt)) place(`geo-asc-${sign}-${i}`, sign, bestLine, pt);
      });
    });
    const center = map.getCenter();
    const flat = map.getProjection()?.type !== 'globe';
    groups.forEach(({ meta: sign, bestLine }) => {
      const [lng, lat] = grid.ascEquator[sign];
      // The copy of the crossing the lines are drawn on (lineEndGroups re-wraps the same way);
      // on the globe there are no copies, only a far side.
      const p = flat ? map.project([lngToVisibleCopy(lng, center.lng), lat]) : projectVisible(map, lng, lat);
      if (!p || !(p.x >= inset && p.x <= w - inset && p.y >= inset && p.y <= h - inset)) return;
      place(`geo-eq-${sign}`, sign, bestLine, { x: p.x, y: p.y }, true);
    });
  }
  return out;
}
