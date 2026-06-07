// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MISSION_SETS,
  loadCompletedSets,
  saveCompletedSets,
  type MissionEvent,
  type MissionSet,
  type MissionTrigger,
} from './missions';

const EMPTY: ReadonlySet<string> = new Set();

export interface MissionsApi {
  /** The set whose guide is open (null when none is shown). */
  openSet: MissionSet | null;
  /** Completed mission ids for the open set. */
  openProgress: ReadonlySet<string>;
  /** Note a user action; checks off any matching mission in incomplete sets. */
  recordEvent: (event: MissionEvent) => void;
  /** Surface the first incomplete set for this trigger. No-op if the trigger has no
   *  incomplete set. By default it also yields when a guide is already open; pass
   *  `replace` to swap the open guide for this one (e.g. a deliberate tool switch). */
  trigger: (trigger: MissionTrigger, replace?: boolean) => void;
  /** Close the open guide. Completion is persisted the moment a set finishes, so
   *  closing early just lets the trigger surface it again later. */
  close: () => void;
  /** Mark a set finished + persist it. For sets the recordEvent path can't auto-finish
   *  on its own — e.g. ones with a mission that's "not applicable" (and so never
   *  recorded) in the current mode. Idempotent. */
  complete: (setId: string) => void;
}

// Owns missions state: which sets are finished (persisted) and, for this session, which
// missions within each unfinished set are done. recordEvent ticks missions off and, the
// instant a set's last mission lands, persists the set so it never nags again — both done
// in the handler (not an effect), so there are no cascading renders. Per-mission progress
// is intentionally session-only (the spec tracks completed SETS), so reloading restarts
// an unfinished set fresh.
//
// recordEvent and trigger are STABLE (empty deps, reading current state via refs). This
// matters because some emitters live inside long-lived map effects (e.g. the measure
// drag) that would re-subscribe — and lose their in-progress drag — if these callbacks
// changed identity each render.
export function useMissions(): MissionsApi {
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>(
    loadCompletedSets,
  );
  const [progress, setProgress] = useState<Record<string, ReadonlySet<string>>>(
    {},
  );
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  // Latest state, read by the stable callbacks below without being their deps.
  const completedRef = useRef(completedSets);
  const progressRef = useRef(progress);
  useEffect(() => {
    completedRef.current = completedSets;
  }, [completedSets]);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const recordEvent = useCallback((event: MissionEvent) => {
    const curProgress = progressRef.current;
    const curCompleted = completedRef.current;
    // Accumulate changes into fresh local objects, then merge in one setState each.
    const progressPatch: Record<string, ReadonlySet<string>> = {};
    const completedPatch: Record<string, boolean> = {};
    for (const set of MISSION_SETS) {
      if (curCompleted[set.id]) continue;
      const done = curProgress[set.id] ?? EMPTY;
      const newly = set.missions
        .filter((m) => m.event === event && !done.has(m.id))
        .map((m) => m.id);
      if (newly.length === 0) continue;
      const updatedDone = new Set([...done, ...newly]);
      progressPatch[set.id] = updatedDone;
      // Persist the set the instant its last mission lands.
      if (set.missions.every((m) => updatedDone.has(m.id))) {
        completedPatch[set.id] = true;
      }
    }
    if (Object.keys(progressPatch).length > 0) {
      setProgress({ ...curProgress, ...progressPatch });
    }
    if (Object.keys(completedPatch).length > 0) {
      const nextCompleted = { ...curCompleted, ...completedPatch };
      setCompletedSets(nextCompleted);
      saveCompletedSets(nextCompleted);
    }
  }, []);

  const trigger = useCallback((t: MissionTrigger, replace = false) => {
    setOpenSetId((cur) => {
      if (cur && !replace) return cur; // a guide is already up (and we're yielding)
      const set = MISSION_SETS.find(
        (s) => s.trigger === t && !completedRef.current[s.id],
      );
      // Nothing incomplete for this trigger — keep whatever's open (don't close it).
      return set ? set.id : cur;
    });
  }, []);

  const close = useCallback(() => setOpenSetId(null), []);

  const complete = useCallback((setId: string) => {
    if (completedRef.current[setId]) return; // already finished
    const next = { ...completedRef.current, [setId]: true };
    setCompletedSets(next);
    saveCompletedSets(next);
  }, []);

  const openSet = useMemo(
    () => MISSION_SETS.find((s) => s.id === openSetId) ?? null,
    [openSetId],
  );
  const openProgress = (openSetId && progress[openSetId]) || EMPTY;

  return { openSet, openProgress, recordEvent, trigger, close, complete };
}
