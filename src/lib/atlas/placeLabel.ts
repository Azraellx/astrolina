// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// How a place's parts become the one-line "City, Region, Country" label every
// surface shows, and the folding that decides when two names are the same name.
//
// Kept apart from cityLookup on purpose: that module carries the ~31k-row atlas,
// which loads as its own lazy chunk, and the rules here are wanted by code that
// must not pull it in just to compare two strings — the pin readout weighing a
// network answer against the atlas's, and Pro's own index over the same rows,
// which has to label them exactly as the core does.

/**
 * Accent-folded, lower-cased form of a name ("São Paulo" → "sao paulo"). The ONE
 * folding the place search, its dedupe and the label rule below all use: two
 * foldings that drift apart would miss matches. (cityLookup re-exports it under
 * the same name for the callers that already reach it there.)
 */
export const foldName = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Join a place's parts — most specific first — into its display label, dropping
 * empty parts and any part that only repeats the one kept before it.
 *
 * The atlas names a city's admin-1 region from a separate list, and hundreds of
 * cities share a name with the region around them ("Lisbon, Lisbon, Portugal",
 * "Tokyo, Tokyo, Japan"), while a couple of hundred regions share their
 * country's ("Taipei, Taiwan, Taiwan"). The repeat says nothing the first copy
 * didn't, costs width in every narrow chip that shows it, and reads as a glitch.
 * (A city-state can come out as a single part — "Singapore", "Luxembourg" — and
 * that is the right answer, not a lost one.)
 *
 * Only an EXACT repeat goes, compared accent-folded so a respelling of the same
 * name ("Zürich" over a region spelled "Zurich") counts as one. A part that
 * merely contains the name before it is kept — "Vienna, State of Vienna,
 * Austria", "New York City, New York, United States" — because there the region
 * is a different thing with a different name, and dropping it would remove
 * information.
 *
 * The rule runs over comma-separated SEGMENTS, not whole parts, because a few
 * atlas names carry commas of their own — a city recorded as "Misato, Saitama"
 * in the prefecture "Saitama", a country "Bonaire, Saint Eustatius and Saba"
 * under the region "Bonaire". Every reader of a label splits it at its commas
 * (the first segment is the settlement), so a segment is what a repeat is.
 *
 * The online geocoder's own label builders already collapse adjacent repeats
 * (exact match, server side), so both sources now land on the same shape.
 */
export function composePlaceLabel(
  parts: readonly (string | null | undefined)[],
): string {
  const kept: string[] = [];
  let lastFolded: string | null = null;
  for (const part of parts) {
    if (!part) continue;
    for (const raw of part.split(',')) {
      const seg = raw.trim();
      if (!seg) continue;
      const f = foldName(seg);
      if (f === lastFolded) continue;
      kept.push(seg);
      lastFolded = f;
    }
  }
  return kept.join(', ');
}

/**
 * The settlement a composed label leads with, folded — "Madrid" for both
 * "Madrid, Spain" and "Madrid, Community of Madrid, Spain". Two sources that
 * agree here have named the same place, whatever list they took the region from.
 */
export function leadPlaceName(label: string): string {
  return foldName(label.split(',')[0].trim());
}
