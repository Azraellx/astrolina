// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The ANGLES mark — it stands in for the WORD, not for the concept.
//
// That distinction decided the drawing. The obvious move is to illustrate the four angles
// astrologically: a chart wheel with the meridian and horizon meeting it. Two versions of
// that were drawn and rejected against the real render:
//   - a ring with a cross THROUGH it is ⊕, a hair from the ⊗ this app already uses as the
//     Part of Fortune glyph. In an astrological UI, a mark that is nearly a body glyph is
//     not a neutral choice.
//   - a ring with the axes stopping short of the centre dodges that and lands on a
//     TARGETING RETICLE instead — which this app also already has, aiming the radar. At
//     12px it was mush besides.
// So: the geometric angle. It is the mark for the word "angle" in every context a reader
// has met one, it survives 12px on two strokes, and it collides with nothing in a glyph
// set full of circled and crossed forms. "Natal ∠" reads as "Natal angles" on sight, which
// is the entire job.
//
// Used as a suffix in place of the word, so a segmented pair reads "Natal ∠ | Transit ∠"
// instead of spending a third of the row on the noun both options share. That makes it
// CONTENT rather than decoration: every caller must carry the spelled-out name on the
// control's accessible name, since there is no visible word for a screen reader to reach.
//
// It is the one icon here that is NOT square. A square box makes the mark cramped and its
// arc useless; the 5:4 box gives the baseline room to run on past the ray, which is the
// shape an angle diagram actually has, and leaves the arc somewhere to sit. 3:2 was tried
// and is too far — the extra width only buys a shallower pitch, and at a shallow pitch the
// rays close on the arc and the whole mark fills in as a solid wedge at button size.
//
// The angle itself is 52°, and that is a separate decision from the box: it was drawn at
// 31° first (the ray reaching the far corner, which a wide box invites) and read as a
// sliver with the arc crushed into the corner. Everything here was judged at true size on a
// 3× screen, which is the only place any of it is visible — a green build proves nothing
// about a 13px drawing.
export function AnglesIcon({
  className,
  // The HEIGHT; width is 1.25× it, per the box above. 13 matches the return buttons' font
  // glyphs rather than sitting a pixel under them like the segment icons this replaced.
  // That rule ("a drawn box runs ink to its own edge where a font glyph carries side
  // bearings, so matching the NUMBER overshoots the MASS") was written for a dense
  // circle-and-cross and doesn't transfer: a few strokes on a diagonal leave most of the
  // box empty, so at 12 the mark read light beside a 600-weight word it is part of.
  size = 13,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={className}
      width={size * 1.25}
      height={size}
      viewBox="0 0 30 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      // The rays are ONE path, not two, so the vertex is a real join rather than two round
      // caps overlapping — that difference shows as a nick at the corner on a high-DPI
      // screen, which is exactly where anyone would be looking at it.
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Vertex (3, 19.25); the ray rises 14.5 to the top of the ink at 52°, which puts it
          at x = 3 + 14.5/tan52° = 14.33; the baseline runs on to 27. Ink therefore spans
          3–27 across and 4.75–19.25 down: both centred (15 of 30, 12 of 24), because
          flexbox centres the BOX, and ink sitting off-centre in it renders a mark that
          looks misaligned beside its word however correct the layout is.

          The 14.5 rise is not arbitrary either — at size 13 it renders about 7.9px, which
          is the cap height of the 11px 600-weight label beside it. The mark sits on the
          word's own line rather than looming over it or hiding under it. */}
      <path d="M14.33 4.75 3 19.25H27" />
      {/* The measure arc, radius 12.9 about the vertex — its two ends sit ON the two rays
          by construction (12.9·cos52°, 12.9·sin52° off the vertex), so it reads as spanning
          the angle rather than as a stray curve inside it. The radius is the whole trick,
          and it is bounded on both sides: the ray is only 18.4 long, so 16 puts the arc at
          87% of it and the mark closes into a filled triangle, while 11 or less collapses
          into the corner. 12.9 is 70% — clear of the vertex, well clear of the tip. */}
      <path d="M15.9 19.25A12.9 12.9 0 0 0 10.94 9.08" />
    </svg>
  );
}
