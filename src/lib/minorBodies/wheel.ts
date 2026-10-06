// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Catalog minor bodies as the chart wheel places them.
//
// The wheel's set is built from the SAME sample the lines are drawn from — the
// chart's own moment, apparent geocentric of date (getMinorSamples) — and moved into
// the reader's zodiac by the same ayanamsa and the same shift function as every
// built-in body. Nothing here decides WHICH bodies are on the wheel: the caller hands
// in the samples it already took, and whatever gates the map applies to lines (no
// birth time, the Angles filter, the natal-lines switch) are not the wheel's to apply.
//
// Deliberately its own type rather than an EclipticPosition. PlanetName and every
// table keyed by it stay closed (see ids.ts), so nothing written for the built-ins —
// the aspect engine, Balance, dignities — can take a catalog body by accident. A
// catalog body on the wheel is PLACED, and that is all; each of those exclusions is a
// decision with its reason on calculation-methods.md, not an oversight of the type.
//
// PURE: no engine import (types only), no React, no DOM — so the verify suite checks
// this function rather than a restatement of it.
import type { TFn } from '../../i18n';
import type { MinorSample } from '../ephemeris';
import type { MinorDecor } from '../astro/minorLines';
import type { OverlayMinorSample } from '../astro/timeline';
import { shiftEclipticPositions } from '../astro/ayanamsa';
import { MINOR_GLYPHS } from '../astro/glyphChars';
import { isHypotheticalKey, minorId, type MinorBodyId } from './ids';
import { minorDisplayLabel } from './naming';

/** One catalog body, ready to place on the natal wheel. */
export interface WheelMinorBody {
  /** `mp:<n>` (`hyp:<se>` for a hypothetical point) — its key on the ring, which no
   *  built-in body or angle code can share. */
  id: MinorBodyId;
  /** MPC number, or a hypothetical point's reserved key (ids.ts). */
  n: number;
  /** "Eros (433)", "(433)" when the catalog knows no name, "Zeus (hyp)" for a
   *  hypothetical point — the naming rule every surface uses (naming.ts). */
  label: string;
  /** DISPLAY ecliptic longitude, radians — already in the reader's zodiac. The only
   *  field the ayanamsa touches. */
  lon: number;
  /** Ecliptic latitude, radians. */
  lat: number;
  /** Right ascension and declination of record, radians — tropical and apparent of
   *  date, exactly as sampled. Frame-independent physics: horizon coordinates are
   *  derived from these, never from `lon`. */
  ra: number;
  dec: number;
  /** Ecliptic longitude motion, degrees/day — and its sign as `retrograde`. Both ABSENT
   *  for a directed or midpoint position (an overlay's solar arc or primaries, a
   *  composite), which has no motion of its own: every readout then prints an em-dash,
   *  as it does for the planets' (EclipticPosition), rather than quote a rate. */
  speed?: number;
  retrograde?: boolean;
  /** Near a station — the same bracket test the built-ins use (stationFromBracket).
   *  False when the sample was taken without the bracket. */
  stationary: boolean;
  /** Its map-line colour in the current theme, so a mark and its lines match. */
  color: string;
  /** Its own astrological symbol where one is encoded; absent for most bodies, which
   *  draw the shared diamond instead. */
  glyph?: string;
  /** A hypothetical point (hypothetical.ts) — drawn with the diamond HOLLOW on every
   *  surface (MinorMark, the rim mark), since it has no symbol. Read off the key, the
   *  same test the map's coin makes (glyphImages.minorIconId). */
  hypothetical: boolean;
  /** Its place in the reader's own list — the order the Minor bodies window shows,
   *  and so the order anything listing these bodies should follow. */
  rank: number;
}

export interface WheelMinorOptions {
  /** The ayanamsa at the chart's own moment (radians; 0 for tropical) — the natal
   *  ring's, the same figure every built-in on that ring is shifted by. */
  ayan: number;
  /** The decoration the map lines are drawn with (name, colour). */
  decor: (n: number) => MinorDecor;
  t: TFn;
  /** The reader's list, in its own order. Ranks the bodies; never filters them. */
  list: readonly { n: number }[];
}

/**
 * The wheel's catalog bodies, in list order.
 *
 * `samples` must be the chart-moment sample (never a slid or line-projected one): the
 * wheel reads a body's longitude, and a line position that has been projected onto the
 * ecliptic or moved to a Slide instant is a different point from the one the chart was
 * cast for. An overlay's samples (timeline.overlayMinorSamples) are the same thing for
 * its ring — its own instant, direction or midpoints, never a projection — and a
 * composite chart's are its midpoints (composite.compositeMinorSamples).
 */
export function buildWheelMinor(
  samples: readonly ((MinorSample & { stationary?: boolean }) | OverlayMinorSample)[],
  { ayan, decor, t, list }: WheelMinorOptions,
): WheelMinorBody[] {
  const order: Record<number, number> = {};
  list.forEach((e, i) => {
    if (order[e.n] === undefined) order[e.n] = i;
  });
  const bodies = samples.map((s, i): WheelMinorBody => {
    const d = decor(s.n);
    const name = d.name.trim();
    const glyph = MINOR_GLYPHS.get(s.n);
    return {
      id: minorId(s.n),
      n: s.n,
      // The one naming rule (naming.ts) — the same call lineCard.minorDisplayName
      // makes, over the same two strings.
      label: minorDisplayLabel(s.n, name, t),
      lon: s.lon,
      lat: s.lat,
      ra: s.ra,
      dec: s.dec,
      ...(s.speed !== undefined ? { speed: s.speed, retrograde: s.speed < 0 } : {}),
      // An overlay's sample is never bracketed (overlayMinorSamples), as the planets'
      // overlay ring never is.
      stationary: 'stationary' in s ? s.stationary === true : false,
      color: d.color,
      ...(glyph ? { glyph } : {}),
      hypothetical: isHypotheticalKey(s.n),
      // A sampled body is always on the list; were one not, it would sort after every
      // body that is, in the order it was sampled, rather than drop out of the set.
      rank: order[s.n] ?? list.length + i,
    };
  });
  return shiftEclipticPositions(bodies, ayan).sort((a, b) => a.rank - b.rank);
}
