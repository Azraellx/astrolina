// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { BirthData } from './birthData';
import { notifyChartsChanged } from './extensions/chartSync';

/** A chart's organizing tag. 'star' is user-assigned (the only one the UI offers);
 *  'space' is a system tag set by in-app chart generation (fixed — no manual control);
 *  'shared' is a system tag set on charts that arrive through a share link (the one
 *  system tag the editor lets you remove). 'none' is the default — and what an
 *  absent `tag` field means on older records. */
export type ChartTag = 'none' | 'star' | 'space' | 'shared';

/** A composite-midpoints chart's parents, snapshotted at generation so the
 *  composite stays intact if a parent chart is later edited or deleted. */
export interface CompositeParents {
  a: BirthData;
  b: BirthData;
}

/** Where a chart's subject lives NOW — a second place on the record, distinct
 *  from the birthplace. `updatedAt` is the client's write stamp, so a build that
 *  syncs charts across devices reconciles it last-write-wins with the rest of
 *  the record. */
export interface ChartHome {
  label: string;
  lat: number;
  lng: number;
  updatedAt: number;
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
  /** Where this chart's subject lives NOW, when that differs from the
   *  birthplace — people move, and relocation questions are asked from where
   *  you are, not where you started. Absent = unset; every consumer falls back
   *  to the birthplace, which is what charts saved before this field existed
   *  have always meant. */
  home?: ChartHome | null;
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

/** How many charts the quick-switch shortlist holds — the switcher dropdown and
 *  the Tab quick-swap read the same handful; the rest live in the manager's
 *  searchable list. */
export const RECENT_COUNT = 5;

/** The quick-switch shortlist: the most recently used handful, newest first. */
export function recentShortlist(charts: readonly StoredChart[]): StoredChart[] {
  return [...charts]
    .sort((a, b) => chartRecency(b) - chartRecency(a))
    .slice(0, RECENT_COUNT);
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
  // Let a downstream build mirror the change to its account store (no-op in the open core).
  notifyChartsChanged(charts);
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

// ── The active chart, readable from outside React ───────────────────────────
// The app holds the chart set and the selected id in component state; this is a
// small mirror of the RESOLVED active chart so plain modules — stores, caches,
// anything keyed on "which chart am I looking at" — can read and follow it
// without being handed props. App publishes on every change; the snapshot is
// whatever object it published, so it stays referentially stable for
// useSyncExternalStore between real changes.

let currentChart: StoredChart | null = null;
const currentListeners = new Set<() => void>();

/** Publish the resolved active chart (the app calls this; nothing else should). */
export function publishCurrentChart(chart: StoredChart | null): void {
  if (chart === currentChart) return;
  currentChart = chart;
  for (const l of currentListeners) l();
}

/** The active chart, or null when the library is empty. Stable between changes. */
export function getCurrentChart(): StoredChart | null {
  return currentChart;
}

/** The active chart's id, or null — the natural scope key for per-chart data. */
export function getCurrentChartId(): string | null {
  return currentChart?.id ?? null;
}

export function subscribeCurrentChart(cb: () => void): () => void {
  currentListeners.add(cb);
  return () => void currentListeners.delete(cb);
}

// ── Patching a chart from outside the tree ──────────────────────────────────
// An editor mounted outside the app's React tree (an extension window in its own
// root, say) still has to be able to write a field back onto a chart. It routes
// through here; the app installs the handler that folds the patch into its state
// and persists it. Unhandled (or unknown id) is a no-op, never a throw.

export type ChartPatchHandler = (id: string, patch: Partial<StoredChart>) => void;

let patchHandler: ChartPatchHandler | null = null;

/** Install the patch handler (the app calls this). Last call wins; null clears. */
export function registerChartPatch(fn: ChartPatchHandler | null): void {
  patchHandler = fn;
}

/** Merge a partial update into a stored chart, persisting + syncing it. */
export function patchChart(id: string, patch: Partial<StoredChart>): void {
  patchHandler?.(id, patch);
}
