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
  /** The line system moved to celestial, because the view or tool asked for has no
   *  meaning under a time-independent mapping. */
  | 'line-system'
  /** The local-space view was closed, because the mapping just chosen can't carry
   *  it. */
  | 'local-space-off';

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
export const AUTO_FLIP_TARGET: Record<AutoFlipKind, string | null> = {
  // The frame segments in the timeline bar's returns row — always on screen when this
  // fires, since the snap that triggered it was clicked two controls away.
  'overlay-frame': '.thud-frame-seg',
  // The Calculation panel's line-system list, when the sidebar happens to be open on it.
  'line-system': '[data-autoflip="line-system"]',
  // Reopened from a menu, so there is nothing persistent to point at.
  'local-space-off': null,
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
