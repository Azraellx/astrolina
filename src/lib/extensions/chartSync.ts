// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Chart-sync seam — lets a downstream build mirror the chart library to its own backend
// WITHOUT editing every save site. saveCharts() (lib/chartLibrary.ts) calls
// notifyChartsChanged after each local write; a gated build registers a handler that pushes
// the set to its account store. The open core registers nothing, so charts stay purely
// local. It is a sibling of the profile-section seam in this folder.

import type { StoredChart } from '../chartLibrary';

export type ChartsChangedHandler = (charts: StoredChart[]) => void;

let handler: ChartsChangedHandler | null = null;

/** Install the chart-sync handler (downstream builds only). Last call wins; null clears it. */
export function registerChartSync(fn: ChartsChangedHandler | null): void {
  handler = fn;
}

/** Notify the installed handler that the local chart set changed (called by saveCharts). */
export function notifyChartsChanged(charts: StoredChart[]): void {
  handler?.(charts);
}
