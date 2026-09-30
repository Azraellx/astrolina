// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The catalog-minor-body preference as React state, with the only writers it has:
// setters, each persisting exactly what the reader chose. There is deliberately
// no persistence EFFECT — an effect would write on mount and could be pointed at
// a derived value by mistake; a setter can only write the thing it was handed
// (see prefs.ts for why that matters here).
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import {
  loadMinorBodiesPref,
  saveMinorBodiesPref,
  MINOR_LIST_CAP,
  MINOR_VISIBLE_CAP,
  type MinorBodiesPref,
  type MinorListEntry,
} from './prefs';
import { minorLoadVersion, subscribeMinorLoads } from './loader';
import { BUILTIN_ALIAS, isListKey } from './ids';

/** What a visibility toggle did — 'cap' means a cap refused it, 'refused' that the key
 *  can't stand on the list at all (see toggle); both wrote nothing. */
export type MinorToggleResult = 'on' | 'off' | 'cap' | 'refused';

export interface MinorBodiesApi {
  pref: MinorBodiesPref;
  /** Bumps whenever a body's load state changes (loading → ready / failed). */
  loadVersion: number;
  /** The family switch — hides every catalog body, keeps the selection. */
  setShown: (shown: boolean) => void;
  /** Switch a body on or off, adding it to the list first if it isn't there.
   *  Switching on past the cap refuses and writes nothing. */
  toggle: (entry: MinorListEntry) => MinorToggleResult;
  /** Take a body off the list entirely. */
  remove: (n: number) => void;
  /** Empty the list: every body off it, and so off the map and the wheel. Harsher than
   *  Hide all, which keeps the selection. Hide all itself (`shown`) is its own control
   *  and is left exactly as it is. */
  clear: () => void;
}

export function useMinorBodies(): MinorBodiesApi {
  const [pref, setPrefState] = useState(loadMinorBodiesPref);
  // The latest value for the setters to build on — a ref, so a burst of toggles in
  // one tick composes instead of each starting from the same stale render.
  const prefRef = useRef(pref);

  const commit = useCallback((next: MinorBodiesPref) => {
    prefRef.current = next;
    setPrefState(next);
    saveMinorBodiesPref(next);
  }, []);

  const setShown = useCallback(
    (shown: boolean) => {
      if (prefRef.current.shown === shown) return;
      commit({ ...prefRef.current, shown });
    },
    [commit],
  );

  const toggle = useCallback(
    (entry: MinorListEntry): MinorToggleResult => {
      // A built-in body's number (1–4 Ceres–Vesta, 2060 Chiron, 134340 Pluto) is never
      // a second copy of that body — search points at its own row instead, and a stored
      // list drops one on load (prefs.ts). Refused HERE too, the one writer, so no
      // caller (a plugin, a future surface) can add one by skipping those. A hypothetical
      // point's key passes: isListKey, never isCatalogNumber, which would refuse it.
      if (BUILTIN_ALIAS.has(entry.n) || !isListKey(entry.n)) return 'refused';
      const p = prefRef.current;
      const inList = p.list.some((e) => e.n === entry.n);
      if (p.visible.includes(entry.n)) {
        commit({ ...p, visible: p.visible.filter((n) => n !== entry.n) });
        return 'off';
      }
      // Counted on the PREFERENCE: bodies that are switched on but currently masked
      // (held, out of range, loading) still count, so unmasking can never land the
      // map over the cap.
      if (p.visible.length >= MINOR_VISIBLE_CAP) return 'cap';
      if (!inList && p.list.length >= MINOR_LIST_CAP) return 'cap';
      // The family switch is NOT touched, even while it hides the list: it has its
      // own control (the window's Hide all), and a row toggle rewriting it would be
      // a silent write from someone else's control (CLAUDE.md rule 1). The window
      // says so at the top of the reader's list, naming Hide all.
      commit({
        ...p,
        list: inList ? p.list : [...p.list, entry],
        visible: [...p.visible, entry.n],
      });
      return 'on';
    },
    [commit],
  );

  const remove = useCallback(
    (n: number) => {
      const p = prefRef.current;
      if (!p.list.some((e) => e.n === n)) return;
      commit({
        ...p,
        list: p.list.filter((e) => e.n !== n),
        visible: p.visible.filter((v) => v !== n),
      });
    },
    [commit],
  );

  const clear = useCallback(() => {
    const p = prefRef.current;
    if (p.list.length === 0 && p.visible.length === 0) return;
    commit({ ...p, list: [], visible: [] });
  }, [commit]);

  const loadVersion = useSyncExternalStore(subscribeMinorLoads, minorLoadVersion, minorLoadVersion);

  return { pref, loadVersion, setShown, toggle, remove, clear };
}
