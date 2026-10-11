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
// of Fortune (2297), Pluto Form Two (2BD3), and the catalog minor bodies'
// MINOR_GLYPHS (2BD9-2BDC, 2BF0-2BF2, and the astral 1F77B-1F77F — which is why the
// pattern carries the `u` flag: without it a class range can't hold a code point
// above U+FFFF, which is two UTF-16 units). Each glyph may carry the U+FE0E
// text-style selector (matched alongside its base, outside the class, to keep the
// class free of combining characters).
//
// Also the two minor-body marks, filled ◆ and hollow ◇ (25C6, 25C7 — lineCard's
// MINOR_MARK / MINOR_HOLLOW_MARK), for copy that explains them. U+25C6 is also the
// Mutable modality glyph; no clash, since this picks a font, not a meaning, and both
// uses draw the subset's one outline.
//
// Exported for the dev pseudo-locale (i18n/pseudo.ts), which must keep exactly these runs
// intact — one pattern, so the two cannot drift apart. (2026-10-09)
export const GLYPH_RUN =
  /((?:[☉-☍☽☿♀-♆♈-♓⚳-⚹⊗□△◆◇⯓⯙-⯜⯰-⯲\u{1F77B}-\u{1F77F}]︎?)+)/u;

/**
 * `translate="no"` for an SVG element, by spread (2026-10-09). Every glyph, and the root of
 * every wheel, is kept out of a browser's page translator — a symbol is not a word, and a
 * translator that reaches one swaps its text node for a <font> of its own, after which React,
 * still holding the original node, can neither update it nor remove it cleanly. `translate`
 * is an HTML global attribute, so React's SVG prop types leave it out; the DOM takes it as the
 * same attribute either way. Lives here, beside the HTML glyph runs, so every mark spells it
 * one way.
 */
export const SVG_NO_TRANSLATE = { translate: 'no' } as const;

// Each glyph run carries translate="no" for SVG_NO_TRANSLATE's reason; the words around it
// stay translatable.
export function glyphify(text: string): ReactNode {
  const parts = text.split(GLYPH_RUN);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="astro-glyph" translate="no">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
