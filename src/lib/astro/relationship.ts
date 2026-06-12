// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Relationship charts derived from two charts (the Synastry overlay's active chart +
// its partner). Davison is a real moment + place, so it returns plain BirthData that
// casts like any natal chart. Composite Midpoints has no real moment: it returns the
// same shape PLUS a `composite` payload (the parents), and its stored moment is the
// synthesized sidereal-frame anchor (see lib/astro/composite.ts). The caller stamps
// the StoredChart fields either way.
import type { BirthData } from '../birthData';
import { birthDataToJD, jdToCivil } from '../ephemeris';
import { NAME_HARD_LIMIT, type CompositeParents } from '../chartLibrary';
import { solveCompositeJd } from './composite';

// Shorter-arc mean of two longitudes (degrees), normalized to [-180, 180). Averaging
// raw longitudes breaks when a pair straddles the ±180° meridian (e.g. +170 and −170
// would average to 0 instead of 180); going via the signed difference takes the nearer
// midpoint.
function midpointLng(a: number, b: number): number {
  const diff = ((b - a + 540) % 360) - 180; // b − a wrapped to (−180, 180]
  const mid = a + diff / 2;
  return (((mid % 360) + 540) % 360) - 180; // normalize to [−180, 180)
}

// Davison relationship chart: the arithmetic mean of the two births in Universal Time
// (one combined moment) at the geographic midpoint of the two birthplaces. The place
// has no city, so it is labelled "Space" with the real midpoint coordinates kept.
export function buildDavison(a: BirthData, b: BirthData): BirthData {
  const jdMid = (birthDataToJD(a) + birthDataToJD(b)) / 2;
  const { year, month, day, hour, minute } = jdToCivil(jdMid);
  return {
    name: `Davison: ${a.name} & ${b.name}`.slice(0, NAME_HARD_LIMIT),
    year,
    month,
    day,
    hour,
    minute,
    tzOffset: 0, // jdMid is already Universal Time
    birthplace: {
      label: 'Space',
      lat: (a.birthplace.lat + b.birthplace.lat) / 2,
      lng: midpointLng(a.birthplace.lng, b.birthplace.lng),
    },
  };
}

// A parent snapshot keeps only the BirthData fields the composite math reads —
// none of the StoredChart bookkeeping (id, timestamps, tags) rides along.
function snapshot(c: BirthData): BirthData {
  return {
    name: c.name,
    year: c.year,
    month: c.month,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
    tzOffset: c.tzOffset,
    birthplace: { ...c.birthplace },
  };
}

// Composite-midpoints relationship chart. The planets are the parents'
// longitude midpoints (computed live from the payload by the render path);
// the stored moment is the minute whose sidereal time realizes the composite
// frame, and the place is the same geographic midpoint Davison uses.
export function buildComposite(
  a: BirthData,
  b: BirthData,
): BirthData & { composite: CompositeParents } {
  const parents: CompositeParents = { a: snapshot(a), b: snapshot(b) };
  const { year, month, day, hour, minute } = jdToCivil(solveCompositeJd(parents));
  return {
    name: `Composite: ${a.name} & ${b.name}`.slice(0, NAME_HARD_LIMIT),
    year,
    month,
    day,
    hour,
    minute,
    tzOffset: 0, // the frame anchor is solved in Universal Time
    birthplace: {
      label: 'Space',
      lat: (a.birthplace.lat + b.birthplace.lat) / 2,
      lng: midpointLng(a.birthplace.lng, b.birthplace.lng),
    },
    composite: parents,
  };
}
