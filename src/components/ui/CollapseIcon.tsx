// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

// Fold/unfold chevron for an overlay nub's bar toggle (the timeline, Synastry and Eclipses
// nubs): pointing DOWN while the bar is open (fold it away beneath the nub), UP while it is
// folded (bring it back). Those nubs carried the show/hide EYE until 2026-10-06, and a slashed
// eye beside "Transits" read as "the transits are hidden" while every transit line was still
// on the map — the toggle only ever folds the bar. Strokes in currentColor; `className`
// defaults to the eye's, so the nubs' existing `.… .eye-icon` sizing applies unchanged.
export function CollapseIcon({
  open,
  className = 'eye-icon',
  size = 15,
}: {
  open: boolean;
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
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? <polyline points="6 9 12 15 18 9" /> : <polyline points="6 15 12 9 18 15" />}
    </svg>
  );
}
