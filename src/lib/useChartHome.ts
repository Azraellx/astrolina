// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Read + write the ACTIVE chart's home place from anywhere, including windows
// mounted outside the app's React tree: reads follow the published active chart,
// writes go back through the patch channel (both in lib/chartLibrary). With no
// chart selected the value is null and writing is a no-op.

import { useSyncExternalStore } from 'react';
import {
  getCurrentChart,
  patchChart,
  subscribeCurrentChart,
  type ChartHome,
} from './chartLibrary';

// The active chart is a stable reference between changes, so keying the snapshot
// cache on it keeps useSyncExternalStore happy (a fresh object per call loops).
let cachedFrom: unknown;
let cached: ChartHome | null = null;
function homeSnapshot(): ChartHome | null {
  const c = getCurrentChart();
  if (c !== cachedFrom) {
    cachedFrom = c;
    cached = c?.home ?? null;
  }
  return cached;
}

/** The active chart's home place (null when unset or no chart is active). */
export function getChartHome(): ChartHome | null {
  return homeSnapshot();
}

export function subscribeChartHome(cb: () => void): () => void {
  return subscribeCurrentChart(cb);
}

/** Write (or clear) the active chart's home place. Stamps `updatedAt`. */
export function setChartHome(home: { label: string; lat: number; lng: number } | null): void {
  const id = getCurrentChart()?.id;
  if (!id) return;
  patchChart(id, {
    home: home ? { ...home, updatedAt: Date.now() } : null,
  });
}

/** Reactive `[home, setHome]` for the active chart. The setter is the module
 *  function itself — already stable, so it needs no memoization. */
export function useChartHome(): [
  ChartHome | null,
  (h: { label: string; lat: number; lng: number } | null) => void,
] {
  const home = useSyncExternalStore(subscribeChartHome, getChartHome);
  return [home, setChartHome];
}
