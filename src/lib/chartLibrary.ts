// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { BirthData } from './birthData';

export interface StoredChart extends BirthData {
  id: string;
  createdAt: number;
  /** Last time this chart was made the active chart — drives the "recent" list.
   *  Absent on charts saved before this existed; callers fall back to createdAt. */
  lastUsedAt?: number;
  /** IANA zone detected from the birthplace (informational + drives DST in the
   *  timeline readout for auto charts). */
  tzIana?: string;
  /** True when the user set tzOffset by hand: it's then authoritative and never
   *  silently re-derived from the coordinates/date. */
  tzManual?: boolean;
  tzUncertain?: boolean;
}

/** Recency key for sorting the "most recently used" list (newest first). */
export function chartRecency(c: StoredChart): number {
  return c.lastUsedAt ?? c.createdAt;
}

// Chart-name length limits. Hard: the most a name can be (enforced on entry). Soft:
// where it gets ellipsised for display around the app (the full name is still stored).
export const NAME_HARD_LIMIT = 50;
export const NAME_SOFT_LIMIT = 30;

/** A chart name trimmed for display: names past the soft limit get an ellipsis. */
export function displayName(name: string): string {
  return name.length > NAME_SOFT_LIMIT
    ? name.slice(0, NAME_SOFT_LIMIT).trimEnd() + '…'
    : name;
}

const STORAGE_KEY = 'astro:charts:v1';
const CURRENT_KEY = 'astro:charts:current:v1';

export function loadCharts(): StoredChart[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredChart[];
  } catch {
    return [];
  }
}

export function saveCharts(charts: StoredChart[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(charts));
}

export function loadCurrentId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}

export function saveCurrentId(id: string | null) {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
}

export function newChartId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
