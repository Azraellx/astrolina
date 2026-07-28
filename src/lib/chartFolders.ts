// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Folders for the chart library.
//
// A folder is not a record anywhere. It is a '/'-separated PATH written on the
// chart — "Clients/2026" — and the tree is derived from the paths in use. That
// one decision carries most of the design:
//
//   · a chart that syncs carries its folder with it, with nothing to reconcile
//     separately and no second store to fall out of step with the first;
//   · every ancestor exists as soon as a descendant does, so there is no way to
//     end up with a chart filed under a folder that has gone missing;
//   · renaming is a rewrite of the charts underneath, which is more writing than
//     a rename of a record would be, but renaming is rare and consistency is not.
//
// The one thing paths cannot express is a folder with nothing in it yet, and
// which folders are open. Both are answered below by a small per-device list —
// per-device deliberately, because "which folders am I looking at" is a property
// of this screen rather than of the library.

import type { StoredChart } from './chartLibrary';

export const FOLDER_SEPARATOR = '/';

/** How deep the tree may go. The list pane is a narrow column and each level
 *  costs indent; past this the names have nowhere left to go. */
export const MAX_FOLDER_DEPTH = 4;

export const MAX_FOLDER_NAME = 40;

/** The unfiled bucket is the absence of a path, not a folder called anything. */
export const UNFILED = '';

// ── Paths ───────────────────────────────────────────────────────────────────

export function folderSegments(path: string): string[] {
  return path.split(FOLDER_SEPARATOR).map((s) => s.trim()).filter(Boolean);
}

/** A path in canonical form: trimmed segments, no empties, depth capped. */
export function normalizeFolderPath(path: string | undefined | null): string {
  if (!path) return UNFILED;
  return folderSegments(path).slice(0, MAX_FOLDER_DEPTH).join(FOLDER_SEPARATOR);
}

export function folderName(path: string): string {
  const segs = folderSegments(path);
  return segs.length ? segs[segs.length - 1] : '';
}

export function parentPath(path: string): string {
  const segs = folderSegments(path);
  return segs.slice(0, -1).join(FOLDER_SEPARATOR);
}

export function folderDepth(path: string): number {
  return folderSegments(path).length;
}

export function joinFolder(parent: string, name: string): string {
  return normalizeFolderPath(parent ? `${parent}${FOLDER_SEPARATOR}${name}` : name);
}

/** A single folder's name — the separator is structure, so it cannot be part of
 *  one, and a name has to be something. */
export function isValidFolderName(name: string): boolean {
  const t = name.trim();
  return t.length > 0 && t.length <= MAX_FOLDER_NAME && !t.includes(FOLDER_SEPARATOR);
}

/** True when `path` is `ancestor` or sits underneath it. */
export function isUnder(path: string, ancestor: string): boolean {
  if (!ancestor) return true;
  return path === ancestor || path.startsWith(`${ancestor}${FOLDER_SEPARATOR}`);
}

/** A chart's folder, normalized; absent reads as unfiled. */
export function chartFolder(c: StoredChart): string {
  return normalizeFolderPath(c.folder);
}

// ── The tree ────────────────────────────────────────────────────────────────

export interface FolderNode {
  path: string;
  name: string;
  depth: number;
  /** Charts filed directly here. */
  count: number;
  /** Charts here and anywhere below. */
  totalCount: number;
  children: FolderNode[];
}

/**
 * Derive the folder tree from the paths in use, plus any folder declared but
 * still empty.
 *
 * Sorted by name at every level, case-insensitively, so the order is stable
 * without anything having to store one.
 */
export function buildFolderTree(
  charts: readonly StoredChart[],
  declared: readonly string[] = [],
): FolderNode[] {
  const direct = new Map<string, number>();
  const all = new Set<string>();

  const register = (path: string) => {
    const segs = folderSegments(path);
    for (let i = 1; i <= segs.length; i++) {
      all.add(segs.slice(0, i).join(FOLDER_SEPARATOR));
    }
  };

  for (const c of charts) {
    const path = chartFolder(c);
    if (!path) continue;
    direct.set(path, (direct.get(path) ?? 0) + 1);
    register(path);
  }
  for (const d of declared) {
    const path = normalizeFolderPath(d);
    if (path) register(path);
  }

  const byParent = new Map<string, string[]>();
  for (const path of all) {
    const parent = parentPath(path);
    const list = byParent.get(parent) ?? [];
    list.push(path);
    byParent.set(parent, list);
  }

  const build = (parent: string): FolderNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => folderName(a).localeCompare(folderName(b), undefined, { sensitivity: 'base' }))
      .map((path) => {
        const children = build(path);
        const count = direct.get(path) ?? 0;
        return {
          path,
          name: folderName(path),
          depth: folderDepth(path),
          count,
          totalCount: count + children.reduce((sum, ch) => sum + ch.totalCount, 0),
          children,
        };
      });

  return build('');
}

/** Every folder path in the tree, depth-first — what a move-to picker offers. */
export function flattenFolders(nodes: readonly FolderNode[]): FolderNode[] {
  const out: FolderNode[] = [];
  const walk = (list: readonly FolderNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

// ── Per-device state ────────────────────────────────────────────────────────

const DECLARED_KEY = 'astro:chart-folders:v1';
const OPEN_KEY = 'astro:chart-folders-open:v1';
const LAST_KEY = 'astro:chart-folder-last:v1';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // A full store must never cost someone their charts; the folder simply is
    // not remembered as an empty one, and reappears as soon as it holds a chart.
  }
}

/** Folders the user has made that hold nothing yet. A folder with charts in it
 *  needs no declaring — the charts are the evidence. */
export function loadDeclaredFolders(): string[] {
  return readList(DECLARED_KEY);
}

export function declareFolder(path: string): string[] {
  const p = normalizeFolderPath(path);
  if (!p) return loadDeclaredFolders();
  const list = loadDeclaredFolders();
  if (!list.includes(p)) list.push(p);
  writeList(DECLARED_KEY, list);
  return list;
}

/** Forget a declared folder, and anything declared underneath it. */
export function undeclareFolder(path: string): string[] {
  const p = normalizeFolderPath(path);
  const list = loadDeclaredFolders().filter((d) => !isUnder(normalizeFolderPath(d), p));
  writeList(DECLARED_KEY, list);
  return list;
}

/** Drop declarations that charts now cover, so the list stays small. */
export function pruneDeclaredFolders(charts: readonly StoredChart[]): void {
  const used = new Set<string>();
  for (const c of charts) {
    const segs = folderSegments(chartFolder(c));
    for (let i = 1; i <= segs.length; i++) used.add(segs.slice(0, i).join(FOLDER_SEPARATOR));
  }
  const list = loadDeclaredFolders().filter((d) => !used.has(normalizeFolderPath(d)));
  writeList(DECLARED_KEY, list);
}

export function loadOpenFolders(): string[] {
  return readList(OPEN_KEY);
}

/**
 * The folder the last chart was saved into, offered as the default for the
 * next one.
 *
 * Charts arrive in runs — a handful of clients, then a few family members —
 * so the folder you used a moment ago is a far better guess than unfiled, and
 * it saves choosing the same one over and over. Per-device, like the rest of
 * the view state: it describes a working session, not the library.
 */
export function loadLastFolder(): string {
  try {
    return normalizeFolderPath(localStorage.getItem(LAST_KEY));
  } catch {
    return UNFILED;
  }
}

export function saveLastFolder(path: string): void {
  try {
    localStorage.setItem(LAST_KEY, normalizeFolderPath(path));
  } catch {
    // Only costs the next chart its default.
  }
}

/**
 * Remember whether a folder row is expanded.
 *
 * Deliberately NOT normalized. Keys come from `buildFolderTree`, which already
 * produced them in canonical form, so normalizing would change nothing that
 * matters — and it is the kind of tidying that quietly breaks a key it was not
 * written for. An earlier version normalized here and rewrote a key on the way
 * in, so the reader never matched it again and that row could not be opened at
 * all. Store what you were given; the caller is the one that knows what it means.
 */
export function setFolderOpen(path: string, open: boolean): string[] {
  const list = loadOpenFolders().filter((x) => x !== path);
  if (open) list.push(path);
  writeList(OPEN_KEY, list);
  return list;
}

// ── Operations over the chart set ───────────────────────────────────────────
//
// Each returns only the charts that CHANGED, so a caller can fold a rename of
// sixty charts into one state update and one save rather than sixty.

/** Move a folder and everything under it to a new path. */
export function renameFolder(
  charts: readonly StoredChart[],
  from: string,
  to: string,
): StoredChart[] {
  const src = normalizeFolderPath(from);
  const dst = normalizeFolderPath(to);
  if (!src || !dst || src === dst) return [];
  return charts
    .filter((c) => isUnder(chartFolder(c), src))
    .map((c) => ({ ...c, folder: dst + chartFolder(c).slice(src.length) }));
}

/** File the named charts under a folder ('' unfiles them). */
export function moveCharts(
  charts: readonly StoredChart[],
  ids: readonly string[],
  to: string,
): StoredChart[] {
  const dst = normalizeFolderPath(to);
  const wanted = new Set(ids);
  return charts
    .filter((c) => wanted.has(c.id) && chartFolder(c) !== dst)
    .map((c) => ({ ...c, folder: dst }));
}

/**
 * Remove a folder, lifting what was inside it up to its parent.
 *
 * Deleting a folder never deletes charts. Someone tidying their library is not
 * asking to lose the people in it, and a folder is only a label on a path.
 */
export function deleteFolder(charts: readonly StoredChart[], path: string): StoredChart[] {
  const src = normalizeFolderPath(path);
  if (!src) return [];
  const parent = parentPath(src);
  return charts
    .filter((c) => isUnder(chartFolder(c), src))
    .map((c) => {
      const rest = chartFolder(c).slice(src.length).replace(/^\//, '');
      return { ...c, folder: normalizeFolderPath(parent && rest ? `${parent}/${rest}` : parent || rest) };
    });
}
