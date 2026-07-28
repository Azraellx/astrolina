// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Verifies chart folders (run via the harness: `npm run verify:folders`).
//
// Folders are a path written on the chart, so most of the logic is string
// handling — and string handling is where a folder feature quietly goes wrong:
// a path that survives a rename but not a re-read, a key that means one thing
// when written and another when read.
//
// That last one is not hypothetical. An early version normalized keys on the
// way into the open/closed store, which rewrote one into something the reader
// never matched again — so that row could not be expanded at all, while every
// other folder worked. Hence the round-trip assertions below: a key written has
// to be the key read back, unchanged.

import {
  buildFolderTree,
  chartFolder,
  declareFolder,
  deleteFolder,
  flattenFolders,
  isValidFolderName,
  joinFolder,
  loadDeclaredFolders,
  loadOpenFolders,
  MAX_FOLDER_DEPTH,
  moveCharts,
  normalizeFolderPath,
  parentPath,
  pruneDeclaredFolders,
  renameFolder,
  setFolderOpen,
  UNFILED,
  undeclareFolder,
} from '../src/lib/chartFolders';
import { recentShortlist, RECENT_COUNT, type StoredChart } from '../src/lib/chartLibrary';

// A minimal store, so the module under test is the real one.
const backing = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
  key: (i: number) => [...backing.keys()][i] ?? null,
  get length() {
    return backing.size;
  },
} as Storage;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

let seq = 0;
function chart(name: string, folder?: string): StoredChart {
  seq += 1;
  return {
    id: `c${seq}`,
    createdAt: seq,
    name,
    year: 1990, month: 1, day: 1, hour: 12, minute: 0,
    tzOffset: 0,
    birthplace: { label: 'Nowhere', lat: 0, lng: 0 },
    ...(folder ? { folder } : {}),
  };
}

// ── Open/closed state round-trips ───────────────────────────────────────────

console.log('\n── A row key written is the row key read back ──');

{
  backing.clear();
  for (const key of ['Clients', 'Clients/2026', 'Research/AstroDataBank/Rectified']) {
    setFolderOpen(key, true);
    check(`${key} round-trips`, loadOpenFolders().includes(key),
      JSON.stringify(loadOpenFolders()));
    setFolderOpen(key, false);
    check(`  …and closes again`, !loadOpenFolders().includes(key));
    setFolderOpen(key, true);
  }
  setFolderOpen('Clients/2026', false);
  check('  closing one leaves the others alone',
    loadOpenFolders().includes('Clients') && !loadOpenFolders().includes('Clients/2026'),
    JSON.stringify(loadOpenFolders()));
  check('  and no key was rewritten on the way in',
    loadOpenFolders().every((k) => k === normalizeFolderPath(k)),
    JSON.stringify(loadOpenFolders()));
}

// ── Paths ───────────────────────────────────────────────────────────────────

console.log('\n── Paths ──');

{
  check('a path is tidied, not mangled', normalizeFolderPath(' Clients / 2026 ') === 'Clients/2026',
    normalizeFolderPath(' Clients / 2026 '));
  check('empty segments collapse', normalizeFolderPath('a//b') === 'a/b', normalizeFolderPath('a//b'));
  check('absent means unfiled', normalizeFolderPath(undefined) === UNFILED);
  check('depth is capped',
    normalizeFolderPath('a/b/c/d/e/f').split('/').length === MAX_FOLDER_DEPTH,
    normalizeFolderPath('a/b/c/d/e/f'));
  check('a separator cannot be part of a name', !isValidFolderName('Clients/2026'));
  check('a blank name is not a name', !isValidFolderName('   '));
  check('joining nests', joinFolder('Clients', '2026') === 'Clients/2026');
  check('joining onto nothing makes a root folder', joinFolder('', 'Clients') === 'Clients');
  check('parent of a root folder is unfiled', parentPath('Clients') === UNFILED);
}

// ── The tree ────────────────────────────────────────────────────────────────

console.log('\n── The tree is derived from the paths in use ──');

{
  backing.clear();
  const charts = [
    chart('A', 'Clients/2026'),
    chart('B', 'Clients/2026'),
    chart('C', 'Clients/2025'),
    chart('D', 'Family'),
    chart('E'),
  ];
  const tree = buildFolderTree(charts, []);
  const paths = flattenFolders(tree).map((n) => n.path).sort();
  check('every ancestor exists without being declared',
    JSON.stringify(paths) === JSON.stringify(['Clients', 'Clients/2025', 'Clients/2026', 'Family']),
    JSON.stringify(paths));

  const clients = tree.find((n) => n.path === 'Clients')!;
  check('a parent counts its descendants', clients.totalCount === 3, String(clients.totalCount));
  check('…but holds none directly', clients.count === 0, String(clients.count));
  check('unfiled charts are not in the tree',
    !flattenFolders(tree).some((n) => n.path === UNFILED));

  // A folder with nothing in it has no chart to prove it exists, so it is
  // declared until one lands there.
  declareFolder('Clients/2027');
  check('a declared empty folder appears',
    flattenFolders(buildFolderTree(charts, loadDeclaredFolders()))
      .some((n) => n.path === 'Clients/2027'));
  pruneDeclaredFolders([...charts, chart('F', 'Clients/2027')]);
  check('…and stops being declared once a chart makes it real',
    !loadDeclaredFolders().includes('Clients/2027'), JSON.stringify(loadDeclaredFolders()));
  undeclareFolder('Clients');
  check('undeclaring a folder undeclares what was under it',
    loadDeclaredFolders().length === 0, JSON.stringify(loadDeclaredFolders()));
}

// ── The quick-switch shortlist ──────────────────────────────────────────────
//
// This list opens in the top bar on a tap, so its contents are read by whoever
// can see the screen. It has to stay inside the active chart's folder: a client
// looking at their own chart must not be shown the last five people you read.

console.log('\n── The quick-switch shortlist stays in its folder ──');

{
  const mk = (name: string, folder: string | undefined, used: number) => {
    const c = chart(name, folder);
    c.lastUsedAt = used;
    return c;
  };
  const charts = [
    mk('Client A', 'Clients', 10),
    mk('Client B', 'Clients', 9),
    mk('Client C', 'Clients', 8),
    mk('Client D', 'Clients', 7),
    mk('Client E', 'Clients', 6),
    mk('Client F', 'Clients', 5),
    mk('Aunt', 'Family', 100), // most recent of all, and must not leak
    mk('Cousin', 'Family', 99),
    mk('Stranger', undefined, 98),
    mk('Nobody', undefined, 97),
  ];
  const namesOf = (list: StoredChart[]) => list.map((c) => c.name);

  const inClients = recentShortlist(charts, charts.find((c) => c.name === 'Client A'));
  check('a filed chart shortlists only its own folder',
    inClients.every((c) => chartFolder(c) === 'Clients'), namesOf(inClients).join(', '));
  check('  the most-recent chart from another folder does not leak',
    !namesOf(inClients).includes('Aunt'), namesOf(inClients).join(', '));
  check('  newest first', namesOf(inClients)[0] === 'Client A', namesOf(inClients)[0]);
  check(`  still capped at ${RECENT_COUNT}`, inClients.length === RECENT_COUNT,
    String(inClients.length));

  const inFamily = recentShortlist(charts, charts.find((c) => c.name === 'Aunt'));
  check('another folder shortlists its own',
    JSON.stringify(namesOf(inFamily)) === JSON.stringify(['Aunt', 'Cousin']),
    namesOf(inFamily).join(', '));

  const unfiled = recentShortlist(charts, charts.find((c) => c.name === 'Stranger'));
  check('an unfiled chart shortlists the other unfiled ones',
    JSON.stringify(namesOf(unfiled)) === JSON.stringify(['Stranger', 'Nobody']),
    namesOf(unfiled).join(', '));

  check('with no active chart it falls back to the whole library',
    recentShortlist(charts).length === RECENT_COUNT,
    String(recentShortlist(charts).length));
}

// ── Moving things about ─────────────────────────────────────────────────────

console.log('\n── Renaming, moving, removing ──');

{
  const charts = [
    chart('A', 'Clients/2026'),
    chart('B', 'Clients/2026/Rectified'),
    chart('C', 'Family'),
    chart('D'),
  ];

  const renamed = renameFolder(charts, 'Clients', 'Practice');
  check('a rename moves everything underneath',
    renamed.length === 2 && renamed.every((c) => chartFolder(c).startsWith('Practice/')),
    renamed.map((c) => chartFolder(c)).join(' , '));
  check('…and only what was underneath',
    !renamed.some((c) => c.name === 'C' || c.name === 'D'));
  check('renaming to itself changes nothing',
    renameFolder(charts, 'Family', 'Family').length === 0);

  // Ids come from the charts themselves — the counter runs across the whole
  // script, so hardcoding one here would name a chart from another block.
  const cId = charts.find((c) => c.name === 'C')!.id;
  const moved = moveCharts(charts, [cId], 'Clients/2026');
  check('a chart can be moved into a folder',
    moved.length === 1 && chartFolder(moved[0]) === 'Clients/2026', String(moved.length));
  check('moving to where it already is is a no-op',
    moveCharts(charts, [cId], 'Family').length === 0);
  check('a chart can be unfiled',
    chartFolder(moveCharts(charts, [cId], UNFILED)[0]) === UNFILED);

  // The one that matters: tidying up must not cost anyone their charts.
  const afterDelete = deleteFolder(charts, 'Clients/2026');
  check('removing a folder lifts its contents to the parent',
    afterDelete.every((c) => chartFolder(c) === 'Clients' || chartFolder(c) === 'Clients/Rectified'),
    afterDelete.map((c) => `${c.name}→${chartFolder(c) || '(unfiled)'}`).join(' , '));
  check('removing a folder deletes no charts', afterDelete.length === 2, String(afterDelete.length));
  const afterRootDelete = deleteFolder(charts, 'Family');
  check('removing a root folder unfiles its charts',
    afterRootDelete.length === 1 && chartFolder(afterRootDelete[0]) === UNFILED,
    afterRootDelete.map((c) => chartFolder(c) || '(unfiled)').join(','));
}

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
