// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The geodetic grid's sign glyphs (lib/astro/geodeticGrid): one at the top of each MC band, and
// one beside each Ascendant curve where it crosses the equator and where it leaves the view at
// the bottom — the sign that BEGINS there in every case.
//
// DOM chips in the label layer rather than glyphs baked into the map's sprites (2026-10-02):
// the map's font has no zodiac glyphs, so a GL label would need a sprite per sign re-baked per
// theme, and would be blind to the panels and to every other label. As DOM they are the same
// ZodiacGlyph the Coordinates box draws, they keep off the panels, the markers and every other
// label through the one occupancy (chipOccupancy.ts), and a capture rasterises them as they
// are on screen. They rank last of all (CHIP_RANK.grid): a glyph with no clear spot is not
// drawn rather than drawn over something the reader asked for.
//
// Where each goes (Lina, 20 Oct 2026, §4, from her check in the app; the sizes are the design
// pass's, to be settled on screenshots):
//   - MC: the band's name, bold and larger (GEO_GRID_CHIPS.mc), centred on the band at the top
//     of the view — on its band-centre meridian, stepped down only off the panels, never slid
//     along the meridian to dodge another label. The twelve read as one row across the top.
//   - AS: regular and smaller, at the curve's equator crossing and where it leaves the view at
//     the BOTTOM — never the top or the sides, which put an AS glyph in the MC row — and nudged
//     east of its curve, into the zone the curve begins, so it names the zone rather than
//     sitting on the line. Inside the polar circles a sign can lie WEST of the curve that
//     begins it (verify-geodetic §8(c)), so an AS glyph is kept only where the readout at its
//     own spot names its sign (ascGlyphNamesItsSign): a glyph is never drawn on the wrong zone.
//   - Crowding: the grid ranks last, so at the lowest zoom the chart's own MC and IC chips — its
//     lines are meridians too on a geodetic map, and every one ends in the top row — took the
//     centred spot of three or four bands and those bands went unnamed (design pass, 2026-10-20,
//     1400×860, the default chart). The rank stays last: the chart's chips are the reading, and
//     the grid steps aside for them, not the other way round. What changed is how far it steps.
//     An MC glyph whose centred spot is taken tries the same row a little east and west, within
//     the band's middle half (MC_SLIDE_DEG) — so it stays in the one row and inside the band it
//     names — and only then a chip lower, centred and slid the same way. An AS glyph whose spot
//     is taken tries the point a chip further north along its curve. Left out if none is clear.
//   - Reach: a panel pushes a glyph off its edge only so far (maxStep). Past that it is left out
//     rather than drawn in the middle of the map, where an MC band's name below the Settings
//     panel read as a label of whatever it landed beside, and a curve's bottom label climbed
//     beside the minimap. And a curve's bottom label is left out where the same curve's equator
//     label is already on screen near it (AS_REPEAT_PX): one sign named twice a few rows apart
//     is clutter, not help.
import type maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { EPS_J2000 } from '../../lib/ephemeris';
import { geoAscGrid, geoReadoutAngles, type GeoGridLineProps } from '../../lib/astro/geodeticGrid';
import { meridianCoords, normLng } from '../../lib/astro/lines';
import { projectVisible } from '../../lib/mapProjection';
import {
  CHIP_GAP,
  CHIP_RANK,
  arcPath,
  arcPoint,
  placeOnPath,
  type ArcPath,
  type ChipOccupancy,
  type ChipPt,
} from './chipOccupancy';
import { lineEndGroups, lngToVisibleCopy, type LineGroup } from './edgeAnchors';

/** Which label a glyph is: an MC band's name, or an Ascendant curve's. */
export type GeoGridChipKind = 'mc' | 'asc';

/** Each kind's glyph: its size (px) and weight, and the half-extents its chip holds (the
 *  glyph with its halo, no pill). Map.tsx renders by these; the capture stamps by them too. */
export const GEO_GRID_CHIPS: Readonly<Record<GeoGridChipKind, { px: number; weight: 400 | 700; hw: number; hh: number }>> = {
  mc: { px: 14, weight: 700, hw: 8, hh: 8 },
  // Bold at 14 px since 21 Oct 2026 (Lina, §4), matching the MC glyphs. The two rows are told
  // apart by where they stand: MC along the top, AS along the bottom (the rule under each AS
  // glyph went on 22 Oct, her §5: bare glyphs, with their halo).
  asc: { px: 14, weight: 700, hw: 8, hh: 8 },
};

export interface GeoGridBadge {
  key: string;
  x: number;
  y: number;
  /** 0 (Aries) … 11 (Pisces). */
  sign: number;
  /** Which label it is, and so its size and weight (GEO_GRID_CHIPS). */
  kind: GeoGridChipKind;
  /** Where it stacks among all the map's labels (chipStack, from the occupancy). */
  z: number;
}

// A run end within this of the inset view's bottom edge is where the line LEAVES the view — the
// clip puts it exactly there, give or take float — rather than a curve's own end inside it.
const EDGE_PX = 1;
// How far an AS glyph's near edge sits east of its curve.
const AS_NUDGE_PX = 2;

// The longitudes an MC glyph tries, east and west of its band-centre meridian, when the centred
// spot is taken: within the band's middle half (±7.5° of a 30° band), so a slid glyph is still
// plainly inside the band it names. Nearest first, east before west.
const MC_SLIDE_DEG = [2.5, -2.5, 5, -5, 7.5, -7.5] as const;

// How far, at most, a panel may push a glyph from where its line meets the view's edge — down
// from the top (MC) or up from the bottom (AS): past the top nav and the Coordinates box, never
// into the middle of the map below a tall panel such as Settings.
// The row inset (2026-10-21): the MC row sits just below the toolbar (the top nav, measured), and
// the AS row the same distance up from the bottom.
function gridRowInset(map: maplibregl.Map, inset: number, hh: number): number {
  const box = map.getContainer().getBoundingClientRect();
  const nav = typeof document !== 'undefined' ? document.querySelector('.topnav-stack') : null;
  const navBottom = nav ? nav.getBoundingClientRect().bottom - box.top : 0;
  return Math.max(inset + hh + 4, navBottom + hh + 8);
}

function maxStep(h: number): number {
  return Math.min(200, h * 0.3);
}

// A curve's bottom label is left out within this of the same curve's equator label: the sign
// is already named right there.
function asRepeatPx(h: number): number {
  return Math.max(120, h / 5);
}

// On the globe the twelve meridians meet at the pole, and so do the chart's own MC and IC lines
// with all their chips, so a band's top end there is never clear: on a whole-globe view not one
// MC glyph placed (design pass, 2026-10-20). There the label meridians stop at GLOBE_TOP_LAT,
// and the glyphs ring the upper globe instead, each at the top of its band as the globe shows
// it. A view zoomed in below that latitude meets the top edge first, as on the flat map.
const GLOBE_TOP_LAT = 60;

// The meridians an MC glyph is placed on: each band's centre (j = -1), then the ones it slides
// to (MC_SLIDE_DEG[j]). Built once per projection kind; never drawn.
interface McLabelProps {
  sign: number;
  j: number;
}
const mcLabelCache: { flat?: McLabels; globe?: McLabels } = {};
interface McLabels {
  centred: Feature<LineString, McLabelProps>[];
  slid: Feature<LineString, McLabelProps>[];
}
function mcLabelMeridians(globe: boolean): McLabels {
  const hit = globe ? mcLabelCache.globe : mcLabelCache.flat;
  if (hit) return hit;
  const meridian = (sign: number, j: number): Feature<LineString, McLabelProps> => {
    const all = meridianCoords(normLng(30 * sign + 15 + (j < 0 ? 0 : MC_SLIDE_DEG[j])));
    return {
      type: 'Feature',
      properties: { sign, j },
      geometry: { type: 'LineString', coordinates: globe ? all.filter(([, lat]) => lat <= GLOBE_TOP_LAT) : all },
    };
  };
  const built: McLabels = { centred: [], slid: [] };
  for (let sign = 0; sign < 12; sign++) {
    built.centred.push(meridian(sign, -1));
    for (let j = 0; j < MC_SLIDE_DEG.length; j++) built.slid.push(meridian(sign, j));
  }
  if (globe) mcLabelCache.globe = built;
  else mcLabelCache.flat = built;
  return built;
}

/**
 * Whether an Ascendant glyph for `sign` at this place names the zone it sits on: the readout
 * there, at the curves' own tilt, gives `sign` as its AS. False inside the polar circles where
 * the sign that begins on a curve lies to its west, or where another sign rises at the spot.
 * Exported for verify-geodetic, which finds such places.
 */
export function ascGlyphNamesItsSign(sign: number, lat: number, lng: number, eps: number): boolean {
  return geoReadoutAngles(lat, lng, eps).as?.signIdx === sign;
}

// The point `d` px further along the path from `from` (a point on it), toward its end when d > 0.
function alongPath(path: ArcPath, from: ChipPt, d: number): ChipPt {
  const { pts, cum } = path;
  let best = Infinity;
  let at = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((from.x - a.x) * dx + (from.y - a.y) * dy) / L)) : 0;
    const e = (a.x + t * dx - from.x) ** 2 + (a.y + t * dy - from.y) ** 2;
    if (e < best) {
      best = e;
      at = cum[i] + t * (cum[i + 1] - cum[i]);
    }
  }
  return arcPoint(path, at + d);
}

/**
 * Place the grid's glyphs for this pass, after every other kind of label: the MC bands' first
 * (`bands`), then each Ascendant curve's equator crossing and bottom exits (`curves`). Only
 * where a glyph lands clear; nothing is ever overlapped.
 *
 * `asc` is the Ascendant collection actually pushed to the map — its features carry where they
 * cross the equator and the tilt they were traced at (geoAscGrid) — so a glyph is placed on the
 * curve that is drawn, and its sign checked at that curve's tilt (CLAUDE.md rule 5). Omitted,
 * the J2000 curves (the no-chart tilt), which is what the map drew before 2026-10-20.
 */
export function placeGeoGridChips(
  map: maplibregl.Map,
  which: { bands: boolean; curves: boolean },
  occupancy: () => ChipOccupancy,
  inset: number,
  asc: FeatureCollection<LineString, GeoGridLineProps> = geoAscGrid(EPS_J2000).asc,
): GeoGridBadge[] {
  const out: GeoGridBadge[] = [];
  if (!which.bands && !which.curves) return out;
  const cont = map.getContainer();
  const w = cont.clientWidth;
  const h = cont.clientHeight;
  const add = (kind: GeoGridChipKind, key: string, sign: number, at: ChipPt) => {
    const { hw, hh } = GEO_GRID_CHIPS[kind];
    out.push({ key, x: at.x, y: at.y, sign, kind, z: occupancy().add(at.x, at.y, hw, hh, CHIP_RANK.grid) });
  };

  // ── The flat map: two straight rows at fixed insets (Lina, 21 Oct 2026, §4) ──
  // The MC row clear of the toolbar at the top, the AS row at the mirrored inset from the
  // bottom, the same two rows at every zoom; each MC glyph centred in its band, each AS glyph
  // just east of where its curve crosses the AS row. A glyph a panel covers is left out. The
  // globe keeps the placement below: its meridians converge, and straight rows don't apply.
  const globe = map.getProjection()?.type === 'globe';
  if (!globe) {
    const rowInset = gridRowInset(map, inset, GEO_GRID_CHIPS.mc.hh);
    const center = map.getCenter();
    const fitsAt = (x: number, y: number, hw: number, hh: number) =>
      x >= inset + hw && x <= w - inset - hw && y >= inset + hh && y <= h - inset - hh;
    const free = (x: number, y: number, hw: number, hh: number) => {
      const occ = occupancy();
      return fitsAt(x, y, hw, hh) && !occ.blocked(x, y, hw, hh) && !occ.crowded(x, y, hw, hh);
    };
    const xAtLng = (lng: number) => map.project([lngToVisibleCopy(lng, center.lng), 0]).x;
    const rows = { top: rowInset, bottom: h - rowInset };
    // (The 90°W and 90°E meridians carried a pair of glyphs at each row from 21 Oct 2026; Lina's §5
    // of 22 Oct took them off — each row keeps its own glyph in its own place. The two meridians
    // stay a weight heavier, and their note shows on hovering the line itself, in the geodetic
    // readout: Map.tsx meridianNote.)
    if (which.bands) {
      const { hw, hh } = GEO_GRID_CHIPS.mc;
      for (let sign = 0; sign < 12; sign++) {
        for (const d of [0, ...MC_SLIDE_DEG]) {
          const x = xAtLng(sign * 30 + 15 + d);
          if (!free(x, rows.top, hw, hh)) continue;
          add('mc', `geo-mc-${sign}`, sign, { x, y: rows.top });
          break;
        }
      }
    }
    if (which.curves) {
      const { hw, hh } = GEO_GRID_CHIPS.asc;
      const y = rows.bottom;
      const groups = lineEndGroups(map, asc.features, inset, (p) => ({
        key: `asc${p.sign}`,
        meta: { sign: p.sign, eps: p.eps ?? EPS_J2000 },
      }));
      groups.forEach(({ meta: { sign, eps }, bestLine }) => {
        for (let i = 1; i < bestLine.length; i++) {
          const a = bestLine[i - 1];
          const b = bestLine[i];
          if (a.y === b.y || (a.y - y) * (b.y - y) > 0) continue;
          const onX = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
          const x = onX + hw + AS_NUDGE_PX;
          if (!free(x, y, hw, hh)) continue;
          const at = map.unproject([x, y]);
          if (!ascGlyphNamesItsSign(sign, at.lat, at.lng, eps)) continue;
          add('asc', `geo-asc-${sign}`, sign, { x, y });
          break;
        }
      });
    }
    return out;
  }

  if (which.bands) {
    // A meridian's visible run, from its TOP end. placeOnPath with no slide: the nearest spot
    // down the meridian clear of the panels (off the top nav), within maxStep of the top; then,
    // for the second row, one chip lower — never further.
    const { hw, hh } = GEO_GRID_CHIPS.mc;
    const reach = maxStep(h);
    const step = 2 * hh + CHIP_GAP;
    const labels = mcLabelMeridians(map.getProjection()?.type === 'globe');
    const runsOf = (fs: Feature<LineString, McLabelProps>[]) =>
      lineEndGroups(map, fs, inset, (p) => ({ key: `mc${p.sign}:${p.j}`, meta: p }));
    const centred = runsOf(labels.centred);
    // The slid meridians' runs, projected only once some band needs them.
    let slid: Map<string, LineGroup<McLabelProps>> | null = null;
    const slides = () => (slid ??= runsOf(labels.slid));
    type Run = { bestEnds: ChipPt[]; bestLine: ChipPt[] };
    const spotOn = (run: Run, row: 0 | 1): ChipPt | null => {
      const top = run.bestEnds.reduce((a, b) => (b.y < a.y ? b : a));
      const spot = placeOnPath(occupancy(), run.bestLine, top, hw, hh, inset, 0);
      if (!spot || Math.hypot(spot.x - top.x, spot.y - top.y) > reach) return null;
      if (row === 0) return spot.clear ? spot : null;
      // The second row: one chip lower along the meridian (its path may run either way).
      const line = run.bestLine;
      const down = (line[0].y <= line[line.length - 1].y ? 1 : -1) * step;
      const lower = placeOnPath(occupancy(), line, alongPath(arcPath(line), spot, down), hw, hh, inset, 0);
      return lower?.clear && Math.hypot(lower.x - top.x, lower.y - top.y) <= reach + step ? lower : null;
    };
    for (let sign = 0; sign < 12; sign++) {
      const runs = function* (): Generator<Run> {
        const c = centred.get(`mc${sign}:-1`);
        if (c) yield c;
        for (let j = 0; j < MC_SLIDE_DEG.length; j++) {
          const s = slides().get(`mc${sign}:${j}`);
          if (s) yield s;
        }
      };
      let spot: ChipPt | null = null;
      for (const row of [0, 1] as const) {
        for (const run of runs()) if ((spot = spotOn(run, row))) break;
        if (spot) break;
      }
      if (spot) add('mc', `geo-mc-${sign}`, sign, spot);
    }
  }

  if (which.curves) {
    const { hw, hh } = GEO_GRID_CHIPS.asc;
    const groups = lineEndGroups(map, asc.features, inset, (p) => ({
      key: `asc${p.sign}`,
      meta: { sign: p.sign, eqLng: p.eqLng, eps: p.eps ?? EPS_J2000 },
    }));
    const center = map.getCenter();
    const flat = map.getProjection()?.type !== 'globe';
    const fits = (p: ChipPt) =>
      p.x >= inset + hw && p.x <= w - inset - hw && p.y >= inset + hh && p.y <= h - inset - hh;
    // The glyph beside a point of its curve: AS_NUDGE_PX clear of it to the EAST — along the
    // parallel as drawn, which on the globe is not the screen's x — kept only on screen, clear of
    // the panels and the other labels, and on its own zone.
    const beside = (on: ChipPt, sign: number, eps: number): ChipPt | null => {
      const ll = map.unproject([on.x, on.y]);
      const east = map.project([ll.lng + 0.05, ll.lat]);
      const ex = east.x - on.x;
      const ey = east.y - on.y;
      const len = Math.hypot(ex, ey);
      if (!(len > 0)) return null;
      const c = { x: on.x + (ex / len) * (hw + AS_NUDGE_PX), y: on.y + (ey / len) * (hw + AS_NUDGE_PX) };
      const occ = occupancy();
      if (!fits(c) || occ.blocked(c.x, c.y, hw, hh) || occ.crowded(c.x, c.y, hw, hh)) return null;
      const at = map.unproject([c.x, c.y]);
      return ascGlyphNamesItsSign(sign, at.lat, at.lng, eps) ? c : null;
    };
    // Beside `on`, else (the stagger) beside the point a chip further NORTH along the curve.
    const placeBeside = (key: string, sign: number, eps: number, line: ChipPt[], on: ChipPt) => {
      const first = beside(on, sign, eps);
      if (first) return add('asc', key, sign, first);
      const path = arcPath(line);
      const north = (line[0].y >= line[line.length - 1].y ? 1 : -1) * (2 * hh + CHIP_GAP);
      const up = beside(alongPath(path, on, north), sign, eps);
      if (up) add('asc', key, sign, up);
    };
    // The equator crossings first: where a curve is the sign's boundary at its most legible.
    groups.forEach(({ meta: { sign, eqLng, eps }, bestLine }) => {
      if (eqLng === undefined) return;
      // The copy of the crossing the lines are drawn on (lineEndGroups re-wraps the same way);
      // on the globe there are no copies, only a far side.
      const p = flat ? map.project([lngToVisibleCopy(eqLng, center.lng), 0]) : projectVisible(map, eqLng, 0);
      if (!p || !(p.x >= inset && p.x <= w - inset && p.y >= inset && p.y <= h - inset)) return;
      placeBeside(`geo-eq-${sign}`, sign, eps, bestLine, { x: p.x, y: p.y });
    });
    // Then where a curve leaves the view at the bottom, stepped back up the curve until the chip
    // is wholly on screen and off the panels (no slide past that), within maxStep of the edge —
    // and not at all where the same curve's equator label is already on screen near it.
    const reach = maxStep(h);
    const repeat = asRepeatPx(h);
    groups.forEach(({ meta: { sign, eps }, bestEnds, bestLine }) => {
      const eq = out.find((b) => b.key === `geo-eq-${sign}`);
      bestEnds.forEach((pt, i) => {
        if (Math.abs(pt.y - (h - inset)) > EDGE_PX) return;
        const on = placeOnPath(occupancy(), bestLine, pt, hw, hh, inset, 0);
        // Measured from where the glyph would actually go, which a panel can push up toward it.
        if (on && eq && Math.hypot(eq.x - on.x, eq.y - on.y) < repeat) return;
        if (on && Math.hypot(on.x - pt.x, on.y - pt.y) <= reach) {
          placeBeside(`geo-asc-${sign}-${i}`, sign, eps, bestLine, on);
        }
      });
    });
  }
  return out;
}
