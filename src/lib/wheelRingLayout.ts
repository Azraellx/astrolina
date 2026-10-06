// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Laying out the catalog minor bodies' ring — the coins wheelGeometry seats at
// `rMinor`, between the zodiac band and the planets.
//
// A second call to placeOnRing, not a new mode of it. The coins have a ring of their
// own, so they get a layout of their own, and the natal planets' layout never sees
// them: a catalog body cannot push a planet off its notch, because the two are never
// in the same pass. Everything placeOnRing already guarantees — the exact least-squares
// arrangement, the per-arc pressure, the resize stability — carries over unchanged.
//
// Pulled out of the renderer for the reason ringLayout was: the renderer
// (WheelSvg) and scripts/verify-wheel-layout.ts both call THIS, so the suite asserts
// about the layout the wheel draws rather than about its own restatement of the
// walls and the arguments. Pure: no React, no DOM, no ephemeris.
//
// The ring is drawn on a single wheel from 600px and never on a bi-wheel
// (MINOR_RING_ENABLED and MINOR_RING_MIN in ./wheelGeometry, with the measurements); where
// it is not, `rMinor` is 0 and this returns an empty map. The verify suites also lay the
// bi-wheel's would-be ring out through it, via `measureMinorRing`, and print what it would
// cost.
import { placeOnRing, type RingMark } from './ringLayout';
import type { WheelGeometry } from './wheelGeometry';

/** Longitude (radians, any range) → degrees in [0, 360). */
const toDeg = (rad: number) => ((((rad * 180) / Math.PI) % 360) + 360) % 360;

/** The chart's four axes, as DISPLAY longitudes in radians — the same zodiac frame
 *  the coins are laid out in. */
export interface RingAxes {
  asc: number;
  dsc: number;
  mc: number;
  ic: number;
}

/** What a wall claims on the ring, in px either side of its longitude: the axis is a
 *  hairline, so a coin may come right up to it and no closer. Exported for
 *  scripts/verify-wheel-layout.ts, which works out when an arc is too narrow for its
 *  coins from the same figure rather than a copy of it. */
export const WALL_HALF_PX = 1;

/**
 * The fixed marks the coins are laid out between.
 *
 * On a chart with a birth time these are the four axes, which the wheel draws at every
 * radius — so a coin the layout kept on its own side of an axis is on the side the
 * reader sees the body on. Walls are what give the ring its ceiling on how far a coin
 * is pushed: placeOnRing splits the circle into arcs at its fixed marks and holds each
 * arc to MAX_PUSH_DEG, while a ring with NO fixed marks is laid out as one 360° arc
 * with no such ceiling at all (see its `anchors.length === 0` branch), where a crowd
 * of coins can fan as far as it likes.
 *
 * A planets-only wheel draws no axes, so it gets 0°, 90°, 180° and 270° instead. Those
 * are not a claim about the chart — they are a device, there purely to cut the ring
 * into four arcs so the same ceiling applies. Pass `null` for that wheel, or when any
 * axis is not a finite number.
 */
export function minorRingWalls(axes: RingAxes | null): number[] {
  const real = axes ? [axes.asc, axes.dsc, axes.mc, axes.ic] : [];
  if (real.length === 4 && real.every(Number.isFinite)) return real;
  return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
}

/**
 * Where each coin is drawn: display longitude in radians, keyed by the body's id.
 *
 * `walls` and `bodies` must be in the same frame (display longitudes, already in the
 * reader's zodiac) — the answer is in that frame too. Empty when the geometry has no
 * catalog ring (`rMinor` 0): below the gate the bodies are rim diamonds at their true
 * degree, and there is nothing to lay out.
 */
export function layoutMinorRing(
  g: Pick<WheelGeometry, 'rMinor' | 'minorDiscHalf' | 'bodyOverlap'>,
  walls: readonly number[],
  bodies: readonly { id: string; lon: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (g.rMinor <= 0 || bodies.length === 0) return out;
  const fixed: RingMark[] = walls.map((lon, i) => ({
    name: `axis:${i}`,
    off: toDeg(lon),
    half: WALL_HALF_PX,
  }));
  const movable: RingMark[] = bodies.map((b) => ({
    name: b.id,
    off: toDeg(b.lon),
    half: g.minorDiscHalf,
  }));
  // A spacing floor of 0: the floor placeOnRing takes is the room a readout trio needs
  // inside the ring, and this ring draws none — the tip and the table carry the degree.
  // The overlap tolerance is the planets' own, so a crowd of coins shares ink on
  // exactly the terms a crowd of planets does.
  const placed = placeOnRing(fixed, movable, 0, g.rMinor, g.bodyOverlap);
  for (const b of bodies) {
    const deg = placed.get(b.id);
    if (deg !== undefined) out.set(b.id, (deg * Math.PI) / 180);
  }
  return out;
}
