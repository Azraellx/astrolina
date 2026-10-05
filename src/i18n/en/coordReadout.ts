// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

export const coordReadout = {
  // Label for the collapsible toggle that reveals the relocated chart angles.
  angles: 'Angles',
  // The same toggle on a geodetic map, where the four angles are the PLACE's own
  // geodetic angles rather than the chart's — GE, for geodetic equivalents.
  // (2026-10-02)
  geodetic: 'GE',
} as const;
