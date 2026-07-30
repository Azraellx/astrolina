// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The auto-flip notice queue-of-one. Mirrors useMissions' shape: state here, the
// card is a pure renderer, and every call happens in an event handler rather than
// an effect, so there are no cascading renders to reason about.
import { useCallback, useRef, useState } from 'react';
import {
  loadSuppressedFlips,
  saveSuppressedFlips,
  type AutoFlipKind,
} from './autoFlipNotice';
import { getViewLock } from './extensions/viewLock';

export interface AutoFlipApi {
  /** The kind waiting to be acknowledged, or null. At most one — these fire from
   *  deliberate single actions, so a queue would only ever hold a stale entry. */
  pending: AutoFlipKind | null;
  /** Announce that `kind`'s setting was just rewritten. `changed` lets the caller
   *  hand over whether anything actually moved, so the no-op check lives HERE
   *  rather than in each call site remembering it — announcing a change that
   *  didn't happen is how a notice becomes noise people learn to dismiss unread. */
  announce: (kind: AutoFlipKind, changed: boolean) => void;
  /** Acknowledge the pending notice; `persist` carries the "Don't show me again"
   *  tick. */
  dismiss: (persist: boolean) => void;
}

export function useAutoFlipNotice(): AutoFlipApi {
  const [pending, setPending] = useState<AutoFlipKind | null>(null);
  // Read once and carried in a ref: the store is only ever written through
  // `dismiss` below, so re-reading localStorage per announce would buy nothing.
  const suppressedRef = useRef<Record<string, boolean> | null>(null);
  if (suppressedRef.current === null) suppressedRef.current = loadSuppressedFlips();

  const announce = useCallback((kind: AutoFlipKind, changed: boolean) => {
    if (!changed) return;
    if (suppressedRef.current?.[kind]) return;
    // A registered surface owns the viewport (the 3D view and friends): the card is
    // parked, so DON'T consume the announcement — no state write, nothing marked.
    // Eating it here would mean the one time the user most needs telling is the one
    // time they're never told. It fires on the next occurrence instead.
    if (getViewLock()) return;
    setPending(kind);
  }, []);

  const dismiss = useCallback((persist: boolean) => {
    setPending((kind) => {
      if (kind && persist) {
        const next = { ...(suppressedRef.current ?? {}), [kind]: true };
        suppressedRef.current = next;
        saveSuppressedFlips(next);
      }
      return null;
    });
  }, []);

  return { pending, announce, dismiss };
}
