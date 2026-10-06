// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The reader's catalog minor bodies: which ones they've added, which are drawn,
// and the family's own on/off switch.
//
// This is a PREFERENCE, and only the reader's own gestures write it (the window's
// toggles and the family switch). It is never written on mount and never from a
// derived value: whatever currently keeps a body off the map — a plan that no
// longer reaches its source, a chart date outside its file, a composite chart, a
// file still loading — is a standing state the App DERIVES, so the reader's
// choice is still here, unchanged, when that state ends (CLAUDE.md, rule 2). Not
// writing on mount is also what keeps a future default reachable: an untouched
// install has no stored value, so a changed default lands on it (rule 6).
//
// The five built-in minor bodies (Chiron, Ceres, Pallas, Juno, Vesta) are NOT
// here — they stay in the map filter's own preference, whichever control toggles
// them.
import { isListKey } from './ids';

export interface MinorListEntry {
  /** MPC number, or a hypothetical point's reserved negative key (ids.ts). */
  n: number;
  /** Display name, cached so the row renders before (or without) its file. */
  name: string;
  /** The source it was added from ('bundled', or a registered source's id). */
  source: string;
}

export interface MinorBodiesPref {
  /** The family switch: false hides every catalog body and KEEPS the selection. */
  shown: boolean;
  /** Every body the reader has added, in the order added. */
  list: MinorListEntry[];
  /** The numbers currently switched on — always a subset of `list`. */
  visible: number[];
}

export const MINOR_PREF_KEY = 'astro:minor-bodies:v1';

/** Catalog bodies drawn at once. A legibility limit — past this the map is
 *  unreadable long before the computation is slow — and counted on the
 *  PREFERENCE, so nothing masked can ever come back over it. */
export const MINOR_VISIBLE_CAP = 20;
/** Bodies kept on the list (each costs a small file once, only when shown). */
export const MINOR_LIST_CAP = 200;

export const EMPTY_MINOR_PREF: MinorBodiesPref = { shown: true, list: [], visible: [] };

/** Read the stored preference, tolerating anything malformed. Reading repairs
 *  nothing in storage: the next deliberate change writes the clean form. */
export function loadMinorBodiesPref(): MinorBodiesPref {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(MINOR_PREF_KEY) ?? 'null');
  } catch {
    return EMPTY_MINOR_PREF;
  }
  if (!raw || typeof raw !== 'object') return EMPTY_MINOR_PREF;
  const r = raw as Partial<Record<keyof MinorBodiesPref, unknown>>;
  const seen = new Set<number>();
  const list: MinorListEntry[] = [];
  for (const e of Array.isArray(r.list) ? r.list : []) {
    if (!e || typeof e !== 'object') continue;
    const { n, name, source } = e as Partial<MinorListEntry>;
    // A number that is really a built-in (1 Ceres, 2060 Chiron…) is dropped, not
    // shown twice — it lives on its own row already. A hypothetical point's reserved
    // key (ids.ts) is kept, a newer build's included: it derives 'unavailable' here
    // rather than vanishing from the reader's list.
    //
    // No key bump (rule 6): the points are new values of `n` in the same shape, and
    // nothing is pre-seeded. The one cost is a rollback — an older build, which reads
    // with isCatalogNumber, drops a hypothetical entry on load, and the next change the
    // reader makes there writes the list without it.
    if (!isListKey(n) || seen.has(n)) continue;
    seen.add(n);
    list.push({
      n,
      name: typeof name === 'string' ? name : '',
      source: typeof source === 'string' && source ? source : 'bundled',
    });
    if (list.length >= MINOR_LIST_CAP) break;
  }
  const visible: number[] = [];
  for (const n of Array.isArray(r.visible) ? r.visible : []) {
    if (typeof n === 'number' && seen.has(n) && !visible.includes(n)) visible.push(n);
    if (visible.length >= MINOR_VISIBLE_CAP) break;
  }
  return { shown: r.shown !== false, list, visible };
}

export function saveMinorBodiesPref(p: MinorBodiesPref): void {
  try {
    localStorage.setItem(MINOR_PREF_KEY, JSON.stringify(p));
  } catch {
    // Storage full or blocked: the choice still holds for this session.
  }
}

// ── Parans with the planets ───────────────────────────────────────────────────
// The catalog bodies' parans (parans.ts generateMinorParans) have their own switch,
// OFF by default: up to six rows per body for every partner on the map is a lot to
// add unasked. A preference like the one above — written only by its own control,
// never on mount, never from the derived value. What keeps it from drawing (map
// Parans off, the sky hold) is a standing state the App derives over it, so the
// reader's choice is still here when that state ends (CLAUDE.md, rule 2). An
// untouched install stores nothing, so the default stays reachable (rule 6).
export const MINOR_PARANS_PREF_KEY = 'astro:minor-parans:v1';

/** The stored switch: on only for an explicit '1'. Anything else — absent, malformed,
 *  storage blocked — reads as the default, off, and reading writes nothing. */
export function loadMinorParansPref(): boolean {
  try {
    return localStorage.getItem(MINOR_PARANS_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

/** For the switch's own control only. */
export function saveMinorParansPref(on: boolean): void {
  try {
    localStorage.setItem(MINOR_PARANS_PREF_KEY, on ? '1' : '0');
  } catch {
    // Storage full or blocked: the choice still holds for this session.
  }
}
