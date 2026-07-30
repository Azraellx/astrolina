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
  /** A dated overlay's frame moved to the moment's own sidereal time, because the
   *  reading asked for is only that reading in that frame. */
  | 'overlay-frame'
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
   *  control, rather than waiting for them to write in about it. (The union has
   *  outgrown its "auto-flip" name by exactly one member; if a third non-flip notice
   *  turns up, rename the module rather than stretching it further.) */
  | 'line-projection';

/** Per-kind behaviour. One table rather than parallel maps, so adding a kind is one
 *  edit and can't half-land. */
export interface AutoFlipMeta {
  /** Selector for the control that undoes or owns this — the card anchors beside it
   *  and marks it. null when there is nothing persistent to point at; a selector that
   *  matches nothing (or matches a collapsed box) falls back the same way. */
  target: string | null;
  /** 'warn' for something the app changed on its own; 'info' for something it is
   *  merely telling you. A red triangle on a settings tip would be shouting. */
  tone: 'warn' | 'info';
  /** Suppress after a single showing, without waiting to be asked. True for a
   *  first-run explanation — it is answering a question the reader hasn't asked yet,
   *  so showing it twice is nagging. False for a report of something that just
   *  happened: that one is worth repeating until they say otherwise. */
  once: boolean;
}

// Where the control that undoes each flip actually LIVES on screen, as a selector the
// notice can find at the moment it appears. A card that says "the frame control is on
// the timeline bar" while floating at the top of a screen whose timeline bar is at the
// bottom has told the reader nothing they can act on — so when the control is on
// screen the card anchors beside it and marks it, and the sentence becomes a label
// for something the eye is already on.
//
// null = no persistent control to point at (it lives behind a menu, or in a settings
// section that may well be collapsed). Those keep the neutral position; the copy names
// where to go instead. A selector that matches nothing falls back the same way, which
// is what makes it safe to name a control that isn't always rendered.
export const AUTO_FLIP_META: Record<AutoFlipKind, AutoFlipMeta> = {
  // The frame segments in the timeline bar's returns row — always on screen when this
  // fires, since the snap that triggered it was clicked two controls away.
  'overlay-frame': { target: '.thud-frame-seg', tone: 'warn', once: false },
  // Both line-system kinds point at the same list in the Calculation panel, when the
  // sidebar happens to be open on it.
  'line-system': { target: '[data-autoflip="line-system"]', tone: 'warn', once: false },
  'line-system-held': {
    target: '[data-autoflip="line-system"]',
    tone: 'warn',
    once: false,
  },
  // Reopened from a menu, so there is nothing persistent to point at.
  'local-space-off': { target: null, tone: 'warn', once: false },
  // Fired by opening the panel this control lives in, so it is guaranteed on screen.
  'line-projection': {
    target: '[data-autoflip="line-projection"]',
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
