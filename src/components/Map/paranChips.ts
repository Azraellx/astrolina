// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The paran labels: one column of chips where the rows cross the centre meridian, and a ranking
// that decides which rows get one where their chips would collide.
//
// A paran is a whole parallel, so its label has no line end to sit at the way an edge chip does.
// It is parked where its row crosses the centre meridian, as it was before 2026-10-01. Third
// iteration of the placement (2026-10-02, Salvatore: "showing every paran label isn't free — go
// with the cost-effective approach, a ranking that prioritizes which ones to show, and keep it to
// one column instead of fanning over 3"):
//
//  1. Every row in one column with no avoidance (until 2026-10-01): ~94 chips stacked, 230
//     overlapping pairs at 1440×810, sliding under the panels (#23).
//  2. Only the rows through a band in the middle of the map, slid along their rows (2026-10-01).
//     Reverted the next day: 93 rows' labels down to 10.
//  3. Every row labelled, each chip slid up to CHIP_SLIDE_CAP along its own row (2026-10-02,
//     morning): ~90 chips fanned three wide either side of the centre, still ~70 overlapping
//     pairs, and in production two 25–50 ms frames at every settle where there had been about one
//     (frames over 17.5 ms in a 2 s pan and settle, desktop: 3–4 → 8).
//
// Now: every chip sits at its row's crossing with the centre meridian. The rows are walked in
// PARAN_RANK order, and a chip is placed only where it is clear of the panels, the tapped markers,
// the chips placed before the parans and the paran chips already placed. Where that spot is taken
// there is a little leniency (same day: "if the space allows, show more labels and make room"):
// one chip's width to the right, then to the left, along the row — so a crowded stretch can carry
// up to three tight columns where they are clear, filled in rank order, and no more. A row with no
// room there gets no chip. Hovering any row still names it, and a tap opens its card, so an
// unlabelled row is one point away. The long slide, the row paths and the per-chip walk are gone:
// a row costs a projection and two box tests, and a nudged one two projections more.
//
// The parans rank below the chart's, an overlay's, Local Space's and the nodes' chips, which are
// placed first, and above the aspect lines, which step off them (CHIP_RANK).
import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import { isMinorParan, type MinorParanProps, type ParanProps } from '../../lib/astro/parans';
import type { PlanetName } from '../../lib/ephemeris';
import { projectVisible, screenAngleOfNorth } from '../../lib/mapProjection';
import { CHIP_RANK, type ChipOccupancy } from './chipOccupancy';
import type { BadgeSize } from './edgeAnchors';

// One chip per labelled paran row, where it crosses the centre meridian.
export interface ParanBadge {
  key: string;
  x: number;
  y: number;
  planetA: ParanProps['planetA'];
  angleA: ParanProps['angleA'];
  planetB: ParanProps['planetB'];
  angleB: ParanProps['angleB'];
  /** A catalog row (MinorParanProps) sets all three: the catalog body's list key, the side it
   *  holds and its colour. The chip draws the body's mark on that side in place of a planet
   *  glyph. Both `planetA` and `planetB` then hold the built-in PARTNER — the fixed-star rows'
   *  convention — so the key `spreadBadges` tests (`'planetA' in b`) is on every paran chip.
   *  Flat rather than one object: Map's sameBadges compares a chip's fields by identity, and a
   *  fresh object every pass would read as a changed chip at every settle. */
  minorN?: number;
  minorSide?: 'A' | 'B';
  minorColor?: string;
  prefix: string;
  /** Click-to-fly target: the paran's intersection point. */
  targetLng: number;
  targetLat: number;
  /** Where it stacks among the map's labels (chipStack, from the occupancy). */
  z?: number;
}

// Which rows keep the column where their chips would meet — lower first, compared in this order
// (Salvatore, 2026-10-02; one table so it can be retuned in one place):
//
//  1. `set`: the chart's own parans before an overlay's. A promoted overlay standing in for the
//     chart counts as the chart (it comes in as the chart's set), as in CHIP_RANK. There is no
//     tier for a natal × overlay pair because there is no such paran: two bodies angular at one
//     moment need one sky (calculation-methods.md, "Under an overlay").
//  2. `pair`: a pair of built-in bodies before a catalog body's pair with one (MinorParanProps).
//     Without it the pair's stronger body would decide, and Sun × Eros would take the column
//     ahead of Saturn × Uranus; a catalog row is labelled only after every built-in row of its
//     set.
//  3. `body`, for the pair's stronger body and then its weaker one: the luminaries, the personal
//     planets, Jupiter and Saturn, the outer planets, then the calculated points, then the minor
//     bodies (Chiron, the four asteroids, and `minorBody` for any body not listed — the catalog
//     body of a catalog row). Planets, points, minor bodies is the class hierarchy the methods
//     page already states ("Orbs of influence by line class").
//  4. The row nearer the middle of the map column, measured across the rows.
//  5. The order the rows came in, so the same view always labels the same rows.
export const PARAN_RANK = {
  set: { chart: 0, overlay: 1 },
  pair: { builtIn: 0, catalog: 1 },
  body: {
    Sun: 0,
    Moon: 0,
    Mercury: 1,
    Venus: 1,
    Mars: 1,
    Jupiter: 2,
    Saturn: 2,
    Uranus: 3,
    Neptune: 3,
    Pluto: 3,
    NorthNode: 4,
    SouthNode: 4,
    Lilith: 4,
    Fortune: 4,
    Chiron: 5,
    Ceres: 5,
    Pallas: 5,
    Juno: 5,
    Vesta: 5,
  } as Readonly<Partial<Record<PlanetName, number>>>,
  minorBody: 5,
} as const;

const bodyRank = (p: PlanetName): number => PARAN_RANK.body[p] ?? PARAN_RANK.minorBody;

/** The leniency beside the centre column, tried only when a row's centre spot is taken: one
 *  chip's width to the right, then to the left (see placeParanChips). */
const PARAN_SIDE_STEPS = [1, -1] as const;
/** Air between a nudged chip and the column it steps out of. */
const PARAN_SIDE_GAP = 6;

// Everything a paran chip's WIDTH depends on — the key its measured size is cached under (Map's
// chipSizesRef, beside the edge chips' faces, which never start with "×") and its `data-bface`.
// A catalog row's face adds the body and its side: the mark drawn there depends on the body.
export function paranChipFace(b: ParanBadge): string {
  const minor = b.minorN !== undefined ? `|${b.minorSide}${b.minorN}` : '';
  return `×|${b.prefix}|${b.planetA}|${b.angleA}|${b.planetB}|${b.angleB}${minor}`;
}

// A paran chip's size before its face has been measured, built like estimateEdgeChip in Map.tsx
// and checked against drawn chips (2026-10-01: 78 × 15 bare, 90–92 × 15 with a two-letter tag):
// 12 px of padding, two 11 px glyphs, ~6 px per code letter, ~8 for the "×" with its margins,
// ~4.5 per tag letter, 3 px flex gaps. Both codes are two letters on a paran chip (MC, IC, As,
// Ds — Map.tsx's ANGLE_CODE). A catalog row's mark stands in for one glyph and is up to a pixel
// wider (the hollow ◇ of a hypothetical point, 12 px; Map.tsx's estimateMinorChip).
export function estimateParanChip(b: ParanBadge): BadgeSize {
  const codeChars = 4;
  const prefixChars = b.prefix.length;
  const items = 5 + (prefixChars ? 1 : 0);
  const w = 12 + 22 + (b.minorN !== undefined ? 1 : 0) + 6 * codeChars + 8 + 4.5 * prefixChars + 3 * (items - 1);
  return { hw: w / 2, hh: 7.5 };
}

interface Cand {
  b: ParanBadge;
  set: number;
  pair: number;
  strong: number;
  weak: number;
  /** Distance (px) from the middle of the map column, across the rows. */
  s: number;
  order: number;
}

const byRank = (p: Cand, q: Cand): number =>
  p.set - q.set ||
  p.pair - q.pair ||
  p.strong - q.strong ||
  p.weak - q.weak ||
  p.s - q.s ||
  p.order - q.order;

// Place the paran chips for this pass, through the pass's occupancy (made on first use, so a pass
// with no row on screen reads nothing). `sets` in the order their rows were pushed — the chart's
// own parans, then an overlay's. `w` × `h` is the map container's size as the pass already read
// it: read again here, it came after the pass's Local Space section had written the canvas mask,
// and could force a style recalculation to answer. Returns the chips in that input order, each
// with its stacking value (the highest-ranked on top, though no two paran chips meet). A set may
// hold catalog rows (MinorParanProps) — the chart's or an overlay's own, ranked by `pair` after
// that set's built-in rows wherever they are passed.
export function placeParanChips(
  map: maplibregl.Map,
  sets: readonly {
    fc: FeatureCollection<LineString, ParanProps | MinorParanProps>;
    overlay: boolean;
  }[],
  occupancy: () => ChipOccupancy,
  sizeOf: (b: ParanBadge) => BadgeSize,
  inset: number,
  w: number,
  h: number,
): ParanBadge[] {
  if (w <= 0 || h <= 0) return [];
  const c = map.getCenter();
  const flat = map.getProjection()?.type !== 'globe';
  // A row's distance from the middle is measured from the camera centre (the map column's
  // centre), across the rows: on the flat map vertically; on a rotated globe, along north there.
  const cp = map.project([c.lng, c.lat]);
  const north = screenAngleOfNorth(map, c.lng, c.lat);
  const nx = Math.sin(north);
  const ny = -Math.cos(north);
  const cands: Cand[] = [];
  let order = 0;
  for (const { fc, overlay } of sets) {
    const set = overlay ? PARAN_RANK.set.overlay : PARAN_RANK.set.chart;
    fc.features.forEach((f, i) => {
      const p = f.properties;
      const n = order++;
      // Where the row crosses the centre meridian: its chip's one spot. Off the visible hemisphere
      // or off screen, the row isn't in view and has no chip. The flat map has no far side, and
      // MapLibre's test for one allocates, for every row.
      const a = flat ? map.project([c.lng, p.latitude]) : projectVisible(map, c.lng, p.latitude);
      if (!a || !(a.x >= 0 && a.x <= w && a.y >= 0 && a.y <= h)) return;
      // A catalog row: its body ranks as `minorBody` (no PlanetName to look up), its partner as
      // itself, and both planet keys hold the partner (ParanBadge.minorN).
      const minor = isMinorParan(p);
      const planetA = minor ? p.partner : p.planetA;
      const planetB = minor ? p.partner : p.planetB;
      const ra = minor ? PARAN_RANK.minorBody : bodyRank(p.planetA);
      const rb = bodyRank(planetB);
      cands.push({
        b: {
          key: `${overlay ? 'pov' : 'pn'}${minor ? 'm' : ''}-${i}`,
          x: a.x,
          y: a.y,
          planetA,
          angleA: p.angleA,
          planetB,
          angleB: p.angleB,
          ...(minor ? { minorN: p.number, minorSide: p.side, minorColor: p.color } : {}),
          // Tag prefix (overlay or promoted); empty for the natal chart's own parans.
          prefix: p.tag ?? '',
          targetLng: p.intersectionLng,
          targetLat: p.latitude,
        },
        set,
        pair: minor ? PARAN_RANK.pair.catalog : PARAN_RANK.pair.builtIn,
        strong: Math.min(ra, rb),
        weak: Math.max(ra, rb),
        s: Math.abs((a.x - cp.x) * nx + (a.y - cp.y) * ny),
        order: n,
      });
    });
  }
  if (!cands.length) return [];
  cands.sort(byRank);
  const placed: { b: ParanBadge; order: number }[] = [];
  const occ = occupancy();
  // Whole on screen inside the inset, clear of the panels and markers, and clear of every chip
  // placed so far — the more important kinds' and the higher-ranked paran rows'.
  const fits = (x: number, y: number, hw: number, hh: number): boolean =>
    x - hw >= inset &&
    x + hw <= w - inset &&
    y - hh >= inset &&
    y + hh <= h - inset &&
    !occ.blocked(x, y, hw, hh) &&
    !occ.crowded(x, y, hw, hh);
  // The point `px` pixels along the row from its centre spot — the row is a parallel, so along it
  // is a change of longitude, scaled by the row's own pixels per degree (the globe and a rotated
  // map included). Two projections, and only for a row whose centre spot was taken.
  const alongRow = (cand: Cand, px: number): { x: number; y: number } | null => {
    const lat = cand.b.targetLat;
    const at = (lng: number) => (flat ? map.project([lng, lat]) : projectVisible(map, lng, lat));
    const one = at(c.lng + 1);
    if (!one) return null;
    const perDeg = Math.hypot(one.x - cand.b.x, one.y - cand.b.y);
    if (perDeg < 1e-3) return null;
    return at(c.lng + px / perDeg);
  };
  for (const cand of cands) {
    const { hw, hh } = sizeOf(cand.b);
    // The centre spot first. Taken, a little leniency (Salvatore, 2026-10-02: "if the space
    // allows, show more labels and make room"): one chip's width to either side along the row —
    // right, then left — so a crowded stretch can carry a second and third column where they are
    // clear, filled in rank order. Rows sit about a chip's height apart, so a nudge shorter than a
    // chip's width would still meet its neighbour; one width either side is the whole allowance,
    // and anything that still doesn't fit is left to hover and the tap card.
    let spot: { x: number; y: number } | null = fits(cand.b.x, cand.b.y, hw, hh) ? cand.b : null;
    for (const side of spot ? [] : PARAN_SIDE_STEPS) {
      const q = alongRow(cand, side * (2 * hw + PARAN_SIDE_GAP));
      if (q && fits(q.x, q.y, hw, hh)) {
        spot = q;
        break;
      }
    }
    if (!spot) continue;
    placed.push({
      b: { ...cand.b, x: spot.x, y: spot.y, z: occ.add(spot.x, spot.y, hw, hh, CHIP_RANK.paran) },
      order: cand.order,
    });
  }
  placed.sort((p, q) => p.order - q.order);
  return placed.map((p) => p.b);
}
