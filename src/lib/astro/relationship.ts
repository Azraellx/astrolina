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
import { NAME_HARD_LIMIT, type CompositeParents, type ParentSnapshot } from '../chartLibrary';
import { solveCompositeFrameJd } from './composite';

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
//
// The parents ride along as `davison` (2026-10-07), the composite's payload in all but
// use: nothing CASTS from them — a Davison is its stored moment and place — but the
// chart header names them ("Derived from:"), and until now a Davison forgot who it was
// made from the moment it was saved. The header names them only while
// buildDavison(parents) still lands on the chart's own moment and place
// (lib/chartHeader davisonParents), so an edited Davison stops claiming them.
export function buildDavison(
  a: ParentSnapshot,
  b: ParentSnapshot,
): BirthData & { davison: CompositeParents } {
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
    davison: { a: snapshot(a), b: snapshot(b) },
  };
}

// A parent snapshot keeps the BirthData fields the composite math reads, plus the three
// the chart header needs to STATE a parent the way the parent's own header does
// (2026-10-07): the zone and how it was entered (tzIana, tzEntry), so the clock is named
// "09:30 EDT (UTC−04:00)" rather than by a bare offset, and whether the time is known at
// all (timeKnown), so a noon placeholder is never printed as a recorded time. Nothing
// here is read by the math. None of the StoredChart bookkeeping (id, timestamps, tags,
// notes) rides along, and an absent field stays absent rather than syncing as undefined.
function snapshot(c: ParentSnapshot): ParentSnapshot {
  const s: ParentSnapshot = {
    name: c.name,
    year: c.year,
    month: c.month,
    day: c.day,
    hour: c.hour,
    minute: c.minute,
    tzOffset: c.tzOffset,
    birthplace: { ...c.birthplace },
  };
  if (c.timeKnown !== undefined) s.timeKnown = c.timeKnown;
  if (c.tzIana) s.tzIana = c.tzIana;
  if (c.tzEntry) s.tzEntry = c.tzEntry;
  return s;
}

// Composite-midpoints relationship chart. The planets are the parents'
// longitude midpoints (computed live from the payload by the render path);
// the stored moment is the minute whose sidereal time realizes the composite
// frame, and the place is the same geographic midpoint Davison uses.
export function buildComposite(
  a: ParentSnapshot,
  b: ParentSnapshot,
): BirthData & { composite: CompositeParents } {
  const parents: CompositeParents = { a: snapshot(a), b: snapshot(b) };
  const { year, month, day, hour, minute } = jdToCivil(solveCompositeFrameJd(parents));
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
