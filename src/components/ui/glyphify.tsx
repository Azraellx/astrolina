// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Renders the astrological symbols inside a plain string with the bundled glyph
// font. Catalog copy (hover hints, tips) is plain text and can't carry markup,
// so symbols like the sextile in "sextile (⚹)" would otherwise fall back to
// whatever the OS substitutes for the UI font — visibly different from the
// same glyph elsewhere in the app. Symbol runs are wrapped in .astro-glyph
// spans; everything else passes through untouched.
import type { ReactNode } from 'react';

// The glyphChars.ts character set: planets/nodes and the conjunction/opposition
// aspects (U+2609-260D, 263D, 263F, 2640-2646), signs (2648-2653), asteroids/
// Lilith and the sextile (26B3-26B9), square/trine shapes (25A1, 25B3), the Part
// of Fortune (2297), and Pluto Form Two (2BD3). Each glyph may carry the U+FE0E
// text-style selector (matched alongside its base, outside the class, to keep the
// class free of combining characters).
const GLYPH_RUN =
  /((?:[☉-☍☽☿♀-♆♈-♓⚳-⚹⊗□△⯓]︎?)+)/;

export function glyphify(text: string): ReactNode {
  const parts = text.split(GLYPH_RUN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="astro-glyph">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
