// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How far a body can be from where a chart with no birth time places it (2026-10-02).
//
// A chart saved without a birth time stores 12:00 civil time as a PLACEHOLDER, and every
// position on it is read at that instant. Noon is the middle of the civil day, so the real
// moment lies within 12 hours of it either side, and a body can be anywhere it travels in
// those 12 hours. Each span below is that distance on that 12-hour basis: the most the body
// moves in 12 hours, which verify-geodetic-chart §3 measures against the ephemeris across
// 1900–2100 (Moon 7.6966°, Mercury 1.1013°, Fortune 7.1946°) and holds these figures to.
//
// Two cases go past the spans, and are recorded here rather than absorbed into wider ones,
// since the figures are an astrologer's call and both are flagged for one:
//   - Mercury's measured 12-hour maximum is 0.0013° (about 5″) past its 1.10°. §3 names
//     that excess as an exception rather than loosening its check for every body.
//   - On the day the clocks go back the civil day is 25 hours long, so a birth just after
//     midnight lies 13 hours before the placeholder. Over 13 hours the Moon moves up to
//     about 8.34°, Mercury 1.19° and Fortune 7.79°: up to about 0.64° past the Moon's band.
//
// Most bodies move under a degree in 12 hours, which is below anything a map line or a
// printed degree can usefully hedge, so they are read at the placeholder like any other
// chart. These are the ones that move further.

import type { PlanetName } from '../ephemeris';

/** The half-widths (degrees of longitude) of the bands a geodetic map draws around a
 *  timeless chart's fast bodies' lines — on a geodetic map the lines don't turn with the
 *  sky, so a chart with no birth time still draws them, from the placeholder. The Moon
 *  moves up to 7.7° in 12 hours and Mercury up to 1.10° (by 0.0013°; see the header). */
export const TIMELESS_BAND_DEG: Readonly<Partial<Record<PlanetName, number>>> = {
  Moon: 7.7,
  Mercury: 1.1,
};

/** The half-widths (degrees) of the RANGES a timeless chart prints and draws on its wheel in
 *  place of a degree to the minute, which would claim a precision the chart doesn't have.
 *  The Moon's is its band. The Part of Fortune exists on a timeless chart only on a geodetic
 *  map, where it is built from the place's own Ascendant, which doesn't move with the
 *  clock: what moves it is the Moon less the Sun, and the Sun's motion over the same hours
 *  partly offsets the Moon's — about 7.2°.
 *
 *  That span is one sect's. The sect formula (the default, and the only one with Advanced
 *  off) reflects a night birth's Fortune across the Ascendant, and with the hour unknown the
 *  sect is unknown too: the wheel takes it at the placeholder, so the span holds for a birth
 *  of that sect and a birth of the other lies in its mirror image. Fortune's note says which
 *  (App's wheelBodyNotes). The Ptolemaic formula is the day one at any hour, so its span
 *  holds outright. Mercury is good to about a degree either way, so
 *  it keeps its printed figure and hedges only on the map, where 1.1° of longitude is a
 *  distance a reader can see. */
export const TIMELESS_RANGE_DEG: ReadonlyMap<PlanetName, number> = new Map<PlanetName, number>([
  ['Moon', 7.7],
  ['Fortune', 7.2],
]);
