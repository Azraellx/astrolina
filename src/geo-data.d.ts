// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Ambient declarations for the offline country-lookup data + decoder. The
// world-atlas JSON is declared loosely so tsc doesn't infer a giant literal type
// from the ~105 KB file, and topojson-client (which ships no types) gets only
// the `feature()` shape we actually use.
declare module 'world-atlas/countries-110m.json' {
  const topology: unknown;
  export default topology;
}

declare module 'topojson-client' {
  export function feature(
    topology: unknown,
    object: unknown,
  ): {
    features: Array<{
      properties: { name?: string } | null;
      geometry: { type: string; coordinates: unknown } | null;
    }>;
  };
}
