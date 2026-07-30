// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The auto-flip notice queue-of-one. Mirrors useMissions' shape: state here, the
// card is a pure renderer, and every call happens in an event handler rather than
// an effect, so there are no cascading renders to reason about.
import { useCallback, useState } from 'react';
import {
  AUTO_FLIP_META,
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
  /** Whether a kind has been silenced. For a caller that has to do something else
   *  first to make the notice appear — open the panel it lives in, say — so it can
   *  skip the whole detour rather than performing it for a card that won't come. */
  isSuppressed: (kind: AutoFlipKind) => boolean;
}

export function useAutoFlipNotice(): AutoFlipApi {
  const [pending, setPending] = useState<AutoFlipKind | null>(null);

  // The store is read on demand rather than cached in a ref. It is a small JSON parse
  // and these fire a handful of times a session, so the cost is nothing — and caching
  // it would assume this hook is the only writer, which stopped being true the moment
  // the store became resettable from outside (a console command, devtools, a second
  // tab). A stale copy there means a tip that has been reset stays silent anyway.
  const announce = useCallback((kind: AutoFlipKind, changed: boolean) => {
    if (!changed) return;
    if (loadSuppressedFlips()[kind]) return;
    // A registered surface owns the viewport (the 3D view and friends): the card is
    // parked, so DON'T consume the announcement — no state write, nothing marked.
    // Eating it here would mean the one time the user most needs telling is the one
    // time they're never told. It fires on the next occurrence instead.
    if (getViewLock()) return;
    // A once-only kind books itself as seen the moment it shows: it is explaining
    // something the reader hasn't asked about yet, so it gets one turn whether or not
    // they think to tick the box. The tick stays on the card anyway — for these it
    // just agrees with what already happened.
    if (AUTO_FLIP_META[kind].once) {
      saveSuppressedFlips({ ...loadSuppressedFlips(), [kind]: true });
    }
    setPending(kind);
  }, []);

  // Reads `pending` from the closure rather than from a state updater: writing to
  // localStorage inside an updater makes it impure, and React is free to run those
  // more than once.
  const dismiss = useCallback(
    (persist: boolean) => {
      if (pending && persist) {
        saveSuppressedFlips({ ...loadSuppressedFlips(), [pending]: true });
      }
      setPending(null);
    },
    [pending],
  );

  const isSuppressed = useCallback(
    (kind: AutoFlipKind) => !!loadSuppressedFlips()[kind],
    [],
  );

  return { pending, announce, dismiss, isSuppressed };
}
