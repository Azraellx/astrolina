// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { BirthData } from './birthData';

/** A chart's organizing tag. 'star' is user-assigned (the only one the UI offers);
 *  'space' is a system tag set by in-app chart generation (no manual control yet).
 *  'none' is the default — and what an absent `tag` field means on older records. */
export type ChartTag = 'none' | 'star' | 'space';

/** A composite-midpoints chart's parents, snapshotted at generation so the
 *  composite stays intact if a parent chart is later edited or deleted. */
export interface CompositeParents {
  a: BirthData;
  b: BirthData;
}

export interface StoredChart extends BirthData {
  id: string;
  createdAt: number;
  /** Last time this chart was made the active chart — drives the "recent" list.
   *  Absent on charts saved before this existed; callers fall back to createdAt. */
  lastUsedAt?: number;
  /** The chart's IANA zone — the one detected from the birthplace, or the one the
   *  user picked instead. Drives DST in the timeline readout; tzOffset is its
   *  DST-aware offset at the birth moment. */
  tzIana?: string;
  /** True when the user picked a zone other than the one detected from the
   *  birthplace (so the editor reopens on that choice rather than re-detecting). */
  tzManual?: boolean;
  tzUncertain?: boolean;
  /** Organizing tag; absent on charts saved before tagging existed. Read via
   *  chartTag() so an absent value reads as 'none'. */
  tag?: ChartTag;
  /** Composite-midpoints payload. When present, the chart's PLANET POSITIONS
   *  are the parents' longitude midpoints (lib/astro/composite.ts), not a cast
   *  of the stored moment — that moment is the synthesized sidereal-frame
   *  anchor, which every gmst/houses/relocation consumer reads normally. */
  composite?: CompositeParents;
}

/** Recency key for sorting the "most recently used" list (newest first). */
export function chartRecency(c: StoredChart): number {
  return c.lastUsedAt ?? c.createdAt;
}

/** A chart's tag, defaulting an absent field to 'none' (back-compat for old records). */
export function chartTag(c: StoredChart): ChartTag {
  return c.tag ?? 'none';
}

// Chart-name length limits. Hard: the most a name can be (enforced on entry). Soft:
// where it gets ellipsised for display around the app (the full name is still stored).
// Starred rows reserve a little width for the star badge, so they ellipsise sooner.
// (Some surfaces pass their own limit, or truncate dynamically by width instead.)
export const NAME_HARD_LIMIT = 50;
export const NAME_SOFT_LIMIT = 25;
export const NAME_SOFT_LIMIT_STARRED = 21;

/** A chart name trimmed for display: names past the given soft limit get an ellipsis. */
export function displayName(name: string, limit = NAME_SOFT_LIMIT): string {
  return name.length > limit ? name.slice(0, limit).trimEnd() + '…' : name;
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
