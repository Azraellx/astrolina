// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The auto-flip notice — shown when an action rewrote a setting the user hadn't
// asked about. One line of WHAT, and nothing more: the reasoning belongs on the
// setting's own hover tip, which is still there tomorrow, whereas this card is
// gone in two seconds. Say what moved, name where it lives, stop.
export const autoFlip = {
  suppress: 'Don’t show me again',
  ok: 'Got it',

  'overlay-frame': {
    title: 'Overlay frame set to Sky now',
    body: 'A return chart only reads as one in its own moment’s frame. The frame control sits at the right of the timeline bar.',
  },
  'line-system': {
    title: 'Line system set to Celestial',
    body: 'What you just opened has no meaning under the Mundane mapping. The line system lives in Calculation.',
  },
  // The map changes exactly as it does above, but nothing was taken — so the sentence
  // that matters here is the one about getting it back, not the one about what moved.
  'line-system-held': {
    title: 'Mundane is on hold',
    body: 'Mundane maps the tropical zodiac onto Earth’s longitudes, so there is no sidereal version of it to draw. Your choice is held, not cleared — set the zodiac back to Tropical and it returns.',
  },
  'local-space-off': {
    title: 'Local space closed',
    body: 'The Mundane mapping is time-independent, and local space is built from the birth moment. Reopen it from the View menu.',
  },
  // Not a change — a difference. Worth saying plainly, because the reader's first
  // encounter with it is usually a set of lines that don't match the program they came
  // from, and "this app is wrong" is the reasonable conclusion from that evidence.
  // Kept short: it lands unasked-for, and the reader is here to look at their map.
  // The control is named rather than pointed at, because the ring beside it is no
  // help to a screen reader — and how far the two readings diverge (Pluto ~17°, the
  // Moon ~5°) belongs in the control's own hint and in Help, not in a card that will
  // be gone in five seconds.
  'line-projection': {
    title: 'These lines are drawn In Mundo',
    body: 'Most other programs default to In Zodiaco — usually why lines here differ from one you already know. Line projection switches it.',
  },
} as const;
