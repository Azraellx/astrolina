// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Auto-flip notices: the acknowledgement half of a setting the app changed ON THE
// USER'S BEHALF.
//
// Some settings can't coexist, and some readings are only correct in one of them —
// so asking for one thing occasionally moves another. That is legitimate; doing it
// in silence is not. A user who watches the map change and can't connect it to
// anything they did concludes the map is wrong, not that a setting moved.
//
// Two kinds of forcing, and only one of them belongs here:
//   - A combination that is VOID (a frame that needs a birth time on a chart with
//     none; a mapping that has no sidereal variant) is never written at all. The
//     stored choice is masked by a derived value and the control shows it
//     unavailable with the reason — there is nothing to announce, because nothing
//     was taken away and it comes back on its own.
//   - A setting genuinely REWRITTEN because an action required it is what this
//     announces. It is one-way on purpose: silently undoing it later would move the
//     map again, out of nowhere, which is the same failure one step removed.
//
// Suppression is per KIND rather than per trigger: several unrelated actions can
// force the same setting, and a reader who has understood the rule once should not
// be told again because they arrived at it from a different direction.
export type AutoFlipKind =
  /** A dated overlay's frame is HELD on the moment's own sidereal time, because the
   *  reading asked for is only that reading in that frame. Held rather than rewritten:
   *  the borrow lasts as long as the reader stays on the return they snapped to, and the
   *  stored preference is underneath it the whole time.
   *
   *  This replaced a kind named 'overlay-frame' that reported the same map movement as a
   *  REWRITE, which is what it then was. The id changed with the fact rather than the id
   *  being reused, so that anyone who dismissed the old sentence — reasonably, having
   *  understood that their frame was gone — is told the new one once. Nobody should
   *  inherit a silence they agreed to about something else. */
  | 'overlay-frame-held'
  /** The line system was REWRITTEN to celestial, because the view or tool asked for
   *  has no meaning under a time-independent mapping. One-way: the stored choice is
   *  gone and has to be picked again. */
  | 'line-system'
  /** The geodetic mapping is merely HELD — a sidereal zodiac has no geodetic variant,
   *  so the map falls back to celestial for as long as that lasts. Deliberately a
   *  separate kind from the rewrite above, not just a separate trigger: the map
   *  changes the same way, but nothing was taken. Telling someone their setting is
   *  gone when it is only waiting is a different (and worse) sentence, and someone
   *  who has understood one of these has not thereby understood the other — so it
   *  carries its own dismissal. */
  | 'line-system-held'
  /** The local-space view was closed, because the mapping just chosen can't carry
   *  it. */
  | 'local-space-off'
  /** Not a flip — the one DEFAULT here that routinely reads as a bug. This app draws
   *  In Mundo where most others draw In Zodiaco, so a reader cross-checking against
   *  the program they came from finds lines that don't agree and reasonably concludes
   *  one of us is wrong. Said once, when they first open the panel that holds the
   *  control, rather than waiting for them to write in about it. That opening is the
   *  ONLY trigger, deliberately: an explanation nobody asked for is welcome beside the
   *  control it is about and an interruption anywhere else. Saving a first chart used to
   *  open Calculation to deliver it, which met a reader with a settings panel at the one
   *  moment they were waiting to see their own map — so don't route anyone here to say
   *  it. The notice keeps until they arrive on their own. (The union has outgrown its
   *  "auto-flip" name by exactly one member; if a third non-flip notice turns up, rename
   *  the module rather than stretching it further.) */
  | 'line-projection';

/** Per-kind behaviour. One table rather than parallel maps, so adding a kind is one
 *  edit and can't half-land. */
export interface AutoFlipMeta {
  /** Selectors for the controls that undo or own this. Every one that is ON SCREEN gets
   *  the ring, and the card places itself clear of ALL of them; the first one found takes
   *  the arrow. Empty when there is nothing persistent to point at; a selector that
   *  matches nothing (or matches a collapsed box) drops out the same way.
   *
   *  A LIST rather than one selector because a notice can be about more than one thing at
   *  once, and the single-target version silently failed at that: the card would clear the
   *  control it knew about and land squarely on the one it didn't, which is how the return
   *  chip's ✕ ended up hidden underneath a card that told the reader to press it. Order
   *  them nearest-first if it matters, since the first is what the arrow lands on. */
  targets: readonly string[];
  /** 'warn' for something the app changed on its own; 'info' for something it is
   *  merely telling you. Picks the MARK on the card and nothing else — both wear the
   *  same cool blue, because neither is a failure and a red one was read as one. So a
   *  triangle here is the difference between a report and an explanation, not the
   *  difference between calm and alarmed. */
  tone: 'warn' | 'info';
  /** Suppress after a single showing, without waiting to be asked. True for a
   *  first-run explanation — it is answering a question the reader hasn't asked yet,
   *  so showing it twice is nagging. False for a report of something that just
   *  happened: that one is worth repeating until they say otherwise. */
  once: boolean;
}

// Where the controls each notice is about actually LIVE on screen, as selectors the
// notice can find at the moment it appears. A card that says "the frame control is on
// the timeline bar" while floating at the top of a screen whose timeline bar is at the
// bottom has told the reader nothing they can act on — so when the controls are on
// screen the card anchors clear of them and marks them, and the sentence becomes a label
// for something the eye is already on.
//
// Empty = no persistent control to point at (it lives behind a menu, or in a settings
// section that may well be collapsed). Those keep the neutral position; the copy names
// where to go instead. A selector that matches nothing falls out the same way, which
// is what makes it safe to name a control that isn't always rendered.
export const AUTO_FLIP_META: Record<AutoFlipKind, AutoFlipMeta> = {
  // TWO controls, because the card names two things and both are on screen: the chip in
  // the timeline nub (the record of the hold, and the ✕ that ends it) and the frame
  // segments in the returns row (the setting being held). Chip first — it is the nearer
  // of the two to where the card lands, so the arrow makes the shorter hop, and it is the
  // one the reader has never seen before.
  //
  // Both are always on screen when this fires: the snap that triggers it takes the borrow
  // in the same handler, so the chip renders in the same commit as this card.
  'overlay-frame-held': {
    targets: ['.thud-return-chip', '.thud-frame-seg'],
    tone: 'warn',
    once: false,
  },
  // Both line-system kinds point at the same list in the Calculation panel, when the
  // sidebar happens to be open on it.
  'line-system': {
    targets: ['[data-autoflip="line-system"]'],
    tone: 'warn',
    once: false,
  },
  'line-system-held': {
    targets: ['[data-autoflip="line-system"]'],
    tone: 'warn',
    once: false,
  },
  // Reopened from a menu, so there is nothing persistent to point at.
  'local-space-off': { targets: [], tone: 'warn', once: false },
  // Fired by opening the panel this control lives in, so it is guaranteed on screen.
  'line-projection': {
    targets: ['[data-autoflip="line-projection"]'],
    tone: 'info',
    once: true,
  },
};

const STORAGE_KEY = 'astro:auto-flip-seen:v1';

/** Kinds the user has ticked "Don't show me again" on. Same `{ [kind]: true }` shape
 *  and the same tolerance for a wedged/absent store as the mission sets. */
export function loadSuppressedFlips(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function saveSuppressedFlips(suppressed: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suppressed));
  } catch {
    // Ignore persistence failures (private mode, quota, etc.).
  }
}
