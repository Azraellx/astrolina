// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// The triangle the app marks a HEADS-UP with — something was changed on the reader's
// behalf, or is about to be, and they would rather know. The twin of InfoIcon: that
// one opens an explanation the reader went looking for, this one interrupts with
// something they didn't ask about. Wherever these notices appear they wear this, so
// the class of message is recognisable before a word of it is read.
//
// Drawn as strokes rather than typed as ⚠, which renders jagged at this size (the
// glyph is bitmapped small in most UI faces), varies by platform, and turns into a
// full-colour emoji on some of them.
//
// Deliberately not an error mark: nothing here has failed, so it inherits
// currentColor and lets the surface decide how loud to be.
export function WarningIcon({ className, size = 13 }: { className?: string; size?: number }) {
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
      {/* Rounded corners so it reads as a caution mark rather than a hazard placard. */}
      <path d="M10.3 3.2 1.9 17.6a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}
