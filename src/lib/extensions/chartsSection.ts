// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Charts-section seam — lets a downstream build drop UI into the chart manager WITHOUT
// editing it: a single optional slot rendered inline beside the "My Charts" title (e.g. a
// cloud-sync status badge). The single-slot twin of the profile-section seam. The open core
// installs nothing, so the title shows alone; charts there are purely local.

import type { ReactNode } from 'react';

export interface ChartsSection {
  /** Rendered inline next to the "My Charts" title — e.g. a sync-status badge from a build
   *  that backs charts up to an account. Absent in the open core. */
  renderHeaderStatus?: () => ReactNode;
}

let section: ChartsSection = {};

/** Install the charts-section customization (downstream builds only). Last call wins. */
export function registerChartsSection(s: ChartsSection): void {
  section = s;
}

/** The installed customization, or an empty object in the open core. */
export function getChartsSection(): ChartsSection {
  return section;
}
