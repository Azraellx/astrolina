// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MISSION_SETS,
  loadCompletedSets,
  loadDismissedSets,
  loadSeenSets,
  saveCompletedSets,
  saveDismissedSets,
  saveSeenSets,
  type MissionEvent,
  type MissionSet,
  type MissionTrigger,
} from './missions';
import { isTouchLayout } from './touch';

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
  /** Permanently suppress a set's guide ("Don't show me again"): its trigger will never
   *  surface it again, even unfinished. Per-set + persisted; idempotent. */
  dismiss: (setId: string) => void;
  /** Mark a set finished + persist it. For sets the recordEvent path can't auto-finish
   *  on its own — e.g. ones with a mission that's "not applicable" (and so never
   *  recorded) in the current mode. Idempotent. */
  complete: (setId: string) => void;
  /** Sets the View ▸ Guides reference can flip through, in display order: those the user
   *  has actually met (surfaced or completed). Falls back to the first set when they
   *  haven't met any yet, so the reference always has something to show. */
  guideSets: MissionSet[];
  /** The check state to display for a set in the reference: every mission for a completed
   *  set, otherwise this session's live progress (empty for a set last met in an earlier
   *  session, since per-mission progress is not persisted). */
  progressFor: (set: MissionSet) => ReadonlySet<string>;
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
  // Sets that have surfaced at least once (persisted) — the View ▸ Guides reference list.
  const [seenSets, setSeenSets] = useState<Record<string, boolean>>(loadSeenSets);
  // Sets the user asked to never see again ("Don't show me again"); persisted, per-set.
  const [dismissedSets, setDismissedSets] = useState<Record<string, boolean>>(loadDismissedSets);
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  // Latest state, read by the stable callbacks below without being their deps.
  const completedRef = useRef(completedSets);
  const progressRef = useRef(progress);
  const seenRef = useRef(seenSets);
  const dismissedRef = useRef(dismissedSets);
  const openIdRef = useRef(openSetId);
  useEffect(() => {
    completedRef.current = completedSets;
  }, [completedSets]);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    seenRef.current = seenSets;
  }, [seenSets]);
  useEffect(() => {
    dismissedRef.current = dismissedSets;
  }, [dismissedSets]);
  useEffect(() => {
    openIdRef.current = openSetId;
  }, [openSetId]);

  // Record (and persist) that a set has surfaced, so it joins the Guides reference list.
  // Stable + ref-based so the trigger callback below can stay stable too. Idempotent.
  const markSeen = useCallback((id: string) => {
    if (seenRef.current[id]) return;
    const next = { ...seenRef.current, [id]: true };
    setSeenSets(next);
    saveSeenSets(next);
  }, []);

  const recordEvent = useCallback((event: MissionEvent) => {
    const curProgress = progressRef.current;
    const curCompleted = completedRef.current;
    const touch = isTouchLayout();
    // Accumulate changes into fresh local objects, then merge in one setState each.
    const progressPatch: Record<string, ReadonlySet<string>> = {};
    const completedPatch: Record<string, boolean> = {};
    for (const set of MISSION_SETS) {
      if (curCompleted[set.id]) continue;
      const done = curProgress[set.id] ?? EMPTY;
      const newly = set.missions
        .filter(
          (m) =>
            (m.event === event || (touch && m.touchEvent === event)) && !done.has(m.id),
        )
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

  const trigger = useCallback(
    (t: MissionTrigger, replace = false) => {
      // openIdRef lags openSetId by one commit. That's fine here: each gesture fires at
      // most one replace=false trigger (the only path that reads `cur`), and the
      // replace=true measure/zoom triggers ignore `cur` entirely — so the ref is always
      // current when it actually matters.
      const cur = openIdRef.current;
      const set = MISSION_SETS.find(
        (s) =>
          s.trigger === t &&
          !completedRef.current[s.id] &&
          !dismissedRef.current[s.id],
      );
      // Surface (and count as "seen") only when it will actually show: nothing is up, or
      // we're explicitly replacing the open guide. Otherwise keep whatever's open.
      if (set && (!cur || replace)) {
        markSeen(set.id);
        setOpenSetId(set.id);
      }
    },
    [markSeen],
  );

  const close = useCallback(() => setOpenSetId(null), []);

  const dismiss = useCallback((setId: string) => {
    if (dismissedRef.current[setId]) return; // already suppressed
    const next = { ...dismissedRef.current, [setId]: true };
    setDismissedSets(next);
    saveDismissedSets(next);
  }, []);

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

  // The reference list: every set the user has met (surfaced or completed), in registry
  // order. Falls back to the first set (the map-click guide) so a brand-new user opening
  // View ▸ Guides still sees the default guide rather than an empty card.
  const guideSets = useMemo(() => {
    const met = MISSION_SETS.filter((s) => seenSets[s.id] || completedSets[s.id]);
    return met.length ? met : [MISSION_SETS[0]];
  }, [seenSets, completedSets]);

  const progressFor = useCallback(
    (set: MissionSet): ReadonlySet<string> =>
      completedSets[set.id]
        ? new Set(set.missions.map((m) => m.id))
        : progress[set.id] ?? EMPTY,
    [completedSets, progress],
  );

  return {
    openSet,
    openProgress,
    recordEvent,
    trigger,
    close,
    dismiss,
    complete,
    guideSets,
    progressFor,
  };
}
