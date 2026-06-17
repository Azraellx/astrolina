// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The top-left profile strip. The open core ships only the plan tag — a pill
// that doubles as the Advanced reading-mode toggle (NEW off, ADV on). Any
// identity element (avatar, username) is supplied by a downstream build through
// the profile-section seam and brings its own strings.
export const profile = {
  planTag: {
    new: 'NEW',
    adv: 'ADV',
    // The tag shows the CURRENT tier; the tip describes what a click switches you
    // TO. From NEW (off) you go to Advanced; from ADV (on) back to the standard
    // view — so the tip is chosen by the current advanced state.
    tip: 'Advanced mode',
    hint: 'Shows more advanced features, intended for experienced astrologers.',
    tipBasic: 'Standard mode',
    hintBasic: 'Hides the advanced features for a simpler, standard view.',
  },
} as const;
