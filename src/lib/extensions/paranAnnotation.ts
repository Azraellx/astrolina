// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// PARAN-annotation slot — a single-slot seam (like skyBandTrack / captureSink)
// letting a downstream build append one computed line of text to a paran, for a
// POSITION along the latitude line. The map calls the registered provider with the
// paran's own feature properties (which carry the pairing's shared sidereal time,
// ParanProps.theta) plus a coordinate, and renders whatever plain-text string comes
// back as a `.ui-tip-sub` line in two places:
//   - the HOVER tip, for the cursor's position — re-queried as the cursor slides
//     along the line;
//   - the click/tap CARD (lib/lineCard buildLineCard's `extra`), for the clicked
//     position. A finger has no hover, so on a touch screen the card is the only
//     place the line can be read at all; and a click takes the hover tip down, so
//     without it a mouse lost the line the moment it asked for the reading.
// No registration → both are unchanged. The provider does its own gating (return
// null to stay silent), the same contract as CaptureSink.isActive: core never asks
// why. The string is plain text, escaped wherever it is set — markup shows as text.
import type { ParanProps } from '../astro/parans';

/** Extra line for a paran at a position along it: plain text, or null for no
 *  annotation. Called per processed hover frame, and once per click — keep it cheap. */
export type ParanAnnotation = (
  props: ParanProps,
  at: { lat: number; lng: number },
) => string | null;

let annotation: ParanAnnotation | null = null;

/** Register the paran annotation (downstream builds only; call once at startup). */
export function setParanAnnotation(fn: ParanAnnotation): void {
  annotation = fn;
}

/** The registered annotation provider, or null (the open core registers none). */
export function getParanAnnotation(): ParanAnnotation | null {
  return annotation;
}
