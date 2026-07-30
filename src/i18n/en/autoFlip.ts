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
  'local-space-off': {
    title: 'Local space closed',
    body: 'The Mundane mapping is time-independent, and local space is built from the birth moment. Reopen it from the View menu.',
  },
} as const;
