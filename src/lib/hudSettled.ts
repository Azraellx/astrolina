// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// `astro:hud-moved` for chrome that moves BY ITSELF — the top nav re-centring or compacting
// beside a dock, the top-left stack dropping under it. The map dodges its edge labels off every
// panel's rect, measured once and cached until a surface says it moved (Map.tsx hudRectsRef); a
// window says so when it is dragged (useMovableHud) or resized (MinorBodiesHud), but these two
// move through CSS — a custom property and a 0.32 s transition — and said nothing. So opening a
// dock left labels under the compact nav and the profile strip until the next pan (video-QA #29:
// 5 MC/IC chips under the nav and 2 under the coordinates readout at 1440×810, all 7 fixed by
// one dispatch).
//
// What this adds is WHEN: only once the boxes have come to REST somewhere new. Not mid-
// transition (the labels would dodge a box that is about to move again), not every step of a
// dock drag (the nav's transition restarts each step and only ends once; the stack, which follows
// the dock with no transition, has to hold still for QUIET_MS first), and never twice for one
// place: the boxes it last announced are remembered, and an unchanged box says nothing. That
// last rule is also what keeps it out of a loop — whatever the dispatch sets off elsewhere (the
// labels re-placed, a phone sheet re-homed) can't bring these boxes back to a new place, and if
// it ever did, the next announcement would be of a real move.

/** How long the boxes must hold still to count as at rest, in ms. It was one frame, which only
 *  held a drag back when the pointer moved on every frame: a hand drags a few frames per step, so
 *  the stack sat still for a frame between steps and was announced at nearly every one (QA,
 *  2026-10-01: 38–41 dispatches over a 40-step drag at 29–67 ms a step; 58 of 60 at one step
 *  every third frame). Longer than the gap between the steps of a drag still in progress, and
 *  short enough that the labels re-placing after a release doesn't read as a delay. */
const QUIET_MS = 120;

/** The memo an announcer keeps of the boxes it last announced. Pass the same object across
 *  re-creations (a component's ref), so a layout effect re-running doesn't re-announce. */
export interface SettledMemo {
  current: string;
}

/**
 * Watches `els` and announces `astro:hud-moved` when they have settled somewhere new.
 *
 * `check()` is for the caller's own layout pass: call it whenever the boxes may have moved. It
 * looks from the next frame on — after the style the pass wrote has applied — and announces once
 * the boxes have held still for QUIET_MS, unless one of `props` is still transitioning on one of
 * the elements, in which case that transition's `transitionend` brings it back. Returns the
 * disposer with it.
 *
 * `extra` adds boxes that are measured with `els` but whose transitions aren't watched, looked up
 * at each look because they come and go — the readout bar under the nav, which mounts with a tool
 * or a place name and changes width with its text (TopNav).
 */
export function watchSettled(
  els: readonly HTMLElement[],
  props: readonly string[],
  memo: SettledMemo,
  extra?: () => Iterable<Element>,
): { check: () => void; dispose: () => void } {
  let raf = 0;
  const box = () =>
    [...els, ...(extra ? extra() : [])]
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`;
      })
      .join('|');
  // getAnimations() flushes pending style first, so a transition the pass has only just started
  // is already listed. A browser without it still has the hold-still rule below, which a box in
  // mid-transition never passes.
  const moving = () =>
    els.some((el) =>
      el.getAnimations?.().some((a) => {
        const prop = (a as Animation & { transitionProperty?: string }).transitionProperty;
        return !!prop && props.includes(prop) && a.playState === 'running';
      }),
    );
  // At rest means the same box for QUIET_MS, too: not everything here moves by a transition —
  // the top-left stack's `left` follows a dock's edge with none, so while a dock is dragged it is
  // somewhere new at every step, and announcing each of those is the storm this exists to avoid.
  // A box seen is looked at again every frame until it has held for that long (a few rects a
  // frame, and only while something has just moved).
  let seen = '';
  let seenAt = 0;
  const look = (t: number) => {
    raf = 0;
    if (moving()) return; // its transitionend checks again
    const now = box();
    if (now === memo.current) {
      seen = ''; // back where it was last announced: nothing to say
      return;
    }
    if (now !== seen) {
      seen = now;
      seenAt = t;
      raf = requestAnimationFrame(look);
      return;
    }
    if (t - seenAt < QUIET_MS) {
      raf = requestAnimationFrame(look);
      return;
    }
    memo.current = now;
    seen = '';
    window.dispatchEvent(new Event('astro:hud-moved'));
  };
  const check = () => {
    if (!raf) raf = requestAnimationFrame(look);
  };
  // transitionend bubbles: a button's colour fade inside the nav must not count, so only the
  // watched elements' own watched properties do. A cancelled transition is checked too — one
  // cut short with no new one behind it ends the movement just the same.
  const onEnd = (e: TransitionEvent) => {
    if (els.includes(e.target as HTMLElement) && props.includes(e.propertyName)) check();
  };
  for (const el of els) {
    el.addEventListener('transitionend', onEnd);
    el.addEventListener('transitioncancel', onEnd);
  }
  return {
    check,
    dispose: () => {
      for (const el of els) {
        el.removeEventListener('transitionend', onEnd);
        el.removeEventListener('transitioncancel', onEnd);
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
