// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Discreet mode's mark: a brimmed hat, a face with nothing on it, and a turned-up
// coat collar.
//
// It exists because the eye had stopped meaning anything in particular. Every
// technique row, every overlay nub and both capture windows toggle with an eye, so
// an eye on THIS control read as one more layer being shown or hidden rather than
// as a mode that changes what the whole app is willing to say out loud.
//
// The face is deliberately blank. At this size a pair of eyes would be two dots
// roughly a pixel apart — not legible, and drawing them would undo the one thing
// the figure is for. An empty face under a hat brim reads as anonymity at 15px in a
// way no amount of detail would.
//
// ONE glyph, no on/off variant, which is the other break from the eye. Both hosts
// already state the mode in colour — `.cm-discreet.is-on` goes accent on a tinted
// field, `.tech-toggle.on` takes an accent border and lights the icon — and a
// second signal inside the artwork would just be quieter duplication. Strokes are
// currentColor, so those hosts colour it for free.
export function SpyIcon({
  className = 'spy-icon',
  size = 15,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Hat crown — a shallow dome (arc radius well over half the chord), so it
          reads as a fedora rather than the bowler an exact semicircle would give.
          It stays WIDER than the head below it: narrow them to the same width and
          the crown stops reading as a hat and starts reading as a bump. */}
      <path d="M8.6 7.1V5.1a5 5 0 0 1 6.8 0v2" />
      {/* The brim. The widest stroke in the glyph and the one doing most of the
          identifying — it is what separates a hat from a haircut at this size. */}
      <path d="M3.4 7.1h17.2" />
      {/* Jaw line: a face with no features in it. Deliberately set a clear step below
          the brim and above the collar — at 15px each of these strokes is barely over
          a pixel, and the gaps are what keep the parts from fusing into a blob. */}
      <path d="M9 8.5v2.2a3.6 3.6 0 0 0 6 0V8.5" />
      {/* Collar and shoulders in one stroke — out from the neck, down the lapels,
          and back up the far side. The lapel notch is kept shallow: cut deeper and the
          chest stops reading as an open coat and starts reading as the letter M.
          Quadratics rather than arcs so both shoulders curve the same way without
          depending on sweep flags. */}
      <path d="M4.8 21v-1.6q0-3.7 3.9-4.7L12 17.7l3.3-3q3.9 1 3.9 4.7V21" />
    </svg>
  );
}
