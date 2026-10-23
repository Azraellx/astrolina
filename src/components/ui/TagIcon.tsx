// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import type { ChartTag } from '../../lib/chartLibrary';

/** The stored ChartTag values plus two DERIVED display marks, never stored in `tag`:
 *  'unknown' (birth time unknown, timeKnown === false) and, since 2026-10-20, 'event'
 *  (an event chart — lib/eventCharts presentedKind, so it hides while the geodetic
 *  hold presents every chart as a person). A chart can be starred AND time-unknown AND
 *  an event, so each marks independently. Like 'space', neither can be assigned by
 *  hand — both follow the data. */
export type DisplayTag = ChartTag | 'unknown' | 'event';

// The little glyph that marks a chart's tag — shown as a prefix on chart names (the
// My Charts list and the top-bar picker), on the form's star toggle, and on the filter
// chips. It carries its own `tag-glyph tag-glyph--<tag>` classes, which set the intrinsic
// colour (gold star, slate planet, red gift, grey question mark, green calendar) in index.css; callers
// pass `className` for size/spacing only. 'none' renders nothing.
//
// Decorative by default (aria-hidden): a chip or a button names the tag in words beside
// it. `label` makes the glyph speak for itself instead — for a mark that is the ONLY
// statement of what it marks, like the event glyph before a chart's name in a list
// (2026-10-20).
export function TagIcon({
  tag,
  className,
  label,
}: {
  tag: DisplayTag;
  className?: string;
  label?: string;
}) {
  const cls = ['tag-glyph', `tag-glyph--${tag}`, className]
    .filter(Boolean)
    .join(' ');
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  if (tag === 'star') {
    return (
      <svg
        className={cls}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        {...a11y}
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
        {...a11y}
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
        {...a11y}
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
        {...a11y}
      >
        <path d="M8.2 8.6a3.8 3.8 0 1 1 5.3 3.6c-1.1.5-1.5 1.2-1.5 2.4v.6" />
        <path d="M12 19.4h.01" strokeWidth="3.2" />
      </svg>
    );
  }
  if (tag === 'event') {
    // A calendar page with one day marked — a chart of a dated moment in the world
    // rather than of a person (2026-10-20). Stroked at the other outline glyphs' weight.
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
        {...a11y}
      >
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17" />
        <path d="M8 3v4M16 3v4" />
        <circle cx="12" cy="15.2" r="1.7" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return null;
}
