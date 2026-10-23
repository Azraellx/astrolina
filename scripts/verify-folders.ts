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
  DEFAULT_EVENT_FOLDER,
  loadLastEventFolder,
  loadLastFolder,
  saveLastEventFolder,
  saveLastFolder,
} from '../src/lib/chartFolders';
import { recentShortlist, RECENT_COUNT, type StoredChart } from '../src/lib/chartLibrary';
import { SECTION_COUNT, switcherSections, tabCycleIds } from '../src/lib/eventCharts';

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

// ── Two shortlists, each in its own folder (2026-10-20) ─────────────────────
//
// With event charts on offer the menu shows an Events list and a People list. Each is
// the same folder-scoped shortlist, of fewer rows, anchored to the active chart when it
// is of that kind and otherwise to the most recent chart of the kind — so the folder
// rule above holds for both, and the held menu is the old list of five exactly.

console.log('\n── Two shortlists, each in its own folder ──');

{
  const mk = (name: string, folder: string | undefined, used: number, event = false) => {
    const c = chart(name, folder);
    c.lastUsedAt = used;
    if (event) c.kind = 'event';
    return c;
  };
  const charts = [
    mk('Client A', 'Clients', 50),
    mk('Client B', 'Clients', 49),
    mk('Client C', 'Clients', 48),
    mk('Client D', 'Clients', 47),
    mk('Client E', 'Clients', 46),
    mk('Client F', 'Clients', 45),
    mk('Aunt', 'Family', 100),
    mk('Cousin', 'Family', 99),
    mk('Aries 2026', 'Mundane/Ingresses', 30, true),
    mk('Cancer 2026', 'Mundane/Ingresses', 29, true),
    mk('Libra 2026', 'Mundane/Ingresses', 28, true),
    mk('Capricorn 2026', 'Mundane/Ingresses', 27, true),
    mk('Aries 2027', 'Mundane/Ingresses', 26, true),
    mk('New Moon', 'Mundane/Lunations', 90, true),
  ];
  const by = (n: string) => charts.find((c) => c.name === n)!;
  const namesOf = (list: StoredChart[]) => list.map((c) => c.name);

  const four = recentShortlist(charts, by('Client A'), SECTION_COUNT);
  const five = recentShortlist(charts, by('Client A'));
  check('a shortlist of four is the first four of the five, in order',
    four.length === SECTION_COUNT && five.length === RECENT_COUNT &&
      JSON.stringify(namesOf(four)) === JSON.stringify(namesOf(five).slice(0, SECTION_COUNT)),
    `${namesOf(four).join(', ')} | ${namesOf(five).join(', ')}`);

  // A person active: People anchors to them; Events to the most recent event's folder.
  const onClient = switcherSections(charts, by('Client A'), 'celestial', false)!;
  check('People anchors to the active person, in their folder',
    onClient.person.length === SECTION_COUNT && onClient.person.every((c) => chartFolder(c) === 'Clients'),
    namesOf(onClient.person).join(', '));
  check('  Events anchors to the most recent event, in ITS folder',
    JSON.stringify(namesOf(onClient.event)) === JSON.stringify(['New Moon']),
    namesOf(onClient.event).join(', '));
  check('  …and neither list holds the other kind',
    onClient.person.every((c) => c.kind !== 'event') && onClient.event.every((c) => c.kind === 'event'));

  // An event active: Events anchors to it; People to the most recent person (Aunt).
  const onIngress = switcherSections(charts, by('Aries 2026'), 'geodetic', false)!;
  check('Events anchors to the active event, in its folder',
    onIngress.event.length === SECTION_COUNT &&
      onIngress.event.every((c) => chartFolder(c) === 'Mundane/Ingresses') &&
      !namesOf(onIngress.event).includes('New Moon'),
    namesOf(onIngress.event).join(', '));
  check('  People anchors to the most recent person — and stays in that person’s folder',
    JSON.stringify(namesOf(onIngress.person)) === JSON.stringify(['Aunt', 'Cousin']),
    namesOf(onIngress.person).join(', '));

  // Held: no sections. The Tab cycle left the folder on 2026-10-23 (Salvatore): it is the
  // library's five most recent, while the menu a click opens (`five`) keeps to Client A's.
  check('held, there are no sections', switcherSections(charts, by('Client A'), 'geodetic', true) === null);
  const heldTab = tabCycleIds(charts, by('Client A'), true);
  const libraryFive = recentShortlist(charts, null).map((c) => c.id);
  check('  …and the Tab cycle is the library’s five most recent, not the folder’s',
    heldTab.length === RECENT_COUNT && JSON.stringify(heldTab) === JSON.stringify(libraryFive) &&
      JSON.stringify(heldTab) !== JSON.stringify(five.map((c) => c.id)),
    namesOf(heldTab.map((id) => charts.find((c) => c.id === id)!)).join(', '));
}

// ── The last event folder is a memory of its own (2026-10-20) ───────────────
//
// Two runs, two keys: filing an ingress must not move where the next client goes, and
// filing a client must not move where the next ingress goes. Each half moves its own
// key and requires the other NOT to move.

console.log('\n── The last event folder is a memory of its own ──');

{
  backing.clear();
  check('an event starts in Mundane while nothing is remembered',
    loadLastEventFolder() === DEFAULT_EVENT_FOLDER && DEFAULT_EVENT_FOLDER === 'Mundane', loadLastEventFolder());
  check('  …while a person starts unfiled, as before', loadLastFolder() === UNFILED, loadLastFolder());
  saveLastEventFolder('Mundane/Ingresses');
  check('saving an event’s folder moves the event memory',
    loadLastEventFolder() === 'Mundane/Ingresses', loadLastEventFolder());
  check('  …and leaves the person memory where it was', loadLastFolder() === UNFILED, loadLastFolder());
  saveLastFolder('Clients/2026');
  check('saving a person’s folder moves the person memory', loadLastFolder() === 'Clients/2026', loadLastFolder());
  check('  …and leaves the event memory where it was',
    loadLastEventFolder() === 'Mundane/Ingresses', loadLastEventFolder());
  saveLastEventFolder(UNFILED);
  check('an event filed as Unfiled is remembered as that, not as the default',
    loadLastEventFolder() === UNFILED, JSON.stringify(loadLastEventFolder()));
  const keys = [...backing.keys()];
  check('  the two memories are two keys', keys.length === 2 && new Set(keys).size === 2, keys.join(', '));
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
