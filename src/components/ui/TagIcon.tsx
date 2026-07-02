// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { ChartTag } from '../../lib/chartLibrary';

/** The stored ChartTag values plus 'unknown' — a DERIVED display tag (birth time
 *  unknown, timeKnown === false), never stored in `tag`: a chart can be starred
 *  AND time-unknown, so the two mark independently. Like 'space', it can't be
 *  assigned by hand — it follows the data. */
export type DisplayTag = ChartTag | 'unknown';

// The little glyph that marks a chart's tag — shown as a prefix on chart names (the
// My Charts list and the top-bar picker), on the form's star toggle, and on the filter
// chips. It carries its own `tag-glyph tag-glyph--<tag>` classes, which set the intrinsic
// colour (gold star, slate planet, red gift, grey question mark) in index.css; callers
// pass `className` for size/spacing only. 'none' renders nothing.
export function TagIcon({ tag, className }: { tag: DisplayTag; className?: string }) {
  const cls = ['tag-glyph', `tag-glyph--${tag}`, className]
    .filter(Boolean)
    .join(' ');
  if (tag === 'star') {
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 2l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.97l-5.88 3.09 1.12-6.55L2.48 8.92l6.58-.96L12 2z" />
      </svg>
    );
  }
  if (tag === 'space') {
    // A ringed planet: a filled disc crossed by a tilted orbit ring.
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
        <ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-25 12 12)" />
      </svg>
    );
  }
  if (tag === 'shared') {
    // A gift box (lid band, ribbon, two-loop bow) — a chart someone sent you
    // through a share link.
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19.5 12.5V19a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-6.5" />
        <rect x="3" y="8" width="18" height="4.5" rx="1" />
        <path d="M12 8v13" />
        <path d="M12 8c-1.9 0-4.7-.7-4.7-3A2.1 2.1 0 0 1 9.4 3c1.8 0 2.6 2.7 2.6 5z" />
        <path d="M12 8c1.9 0 4.7-.7 4.7-3A2.1 2.1 0 0 0 14.6 3c-1.8 0-2.6 2.7-2.6 5z" />
      </svg>
    );
  }
  if (tag === 'unknown') {
    // A question mark, stroked to match the other glyphs' weight — the chart's
    // birth TIME is unknown (empty time in the form).
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M8.2 8.6a3.8 3.8 0 1 1 5.3 3.6c-1.1.5-1.5 1.2-1.5 2.4v.6" />
        <path d="M12 19.4h.01" strokeWidth="3.2" />
      </svg>
    );
  }
  return null;
}
