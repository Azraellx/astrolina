// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useTouchLayout } from '../../lib/touch';
import './Sidebar.css';

// A small tab on the right edge (touch only) that toggles the settings dock — a quick
// alternative to View ▸ Settings on a phone/tablet. It persists while the dock is open,
// riding to the panel's left edge so it doubles as a second close affordance beside the
// header ×. Hides itself off touch.
export function SettingsNub({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const touch = useTouchLayout();
  if (!touch) return null;
  return (
    <button
      type="button"
      className={`settings-nub${open ? ' is-open' : ''}`}
      onClick={onToggle}
      aria-label={open ? 'Close settings' : 'Open settings'}
      aria-expanded={open}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Chevron points inward (‹) to pull the dock in when closed, outward (›) to push it back when open. */}
        <path d={open ? 'M10 7l5 5-5 5' : 'M14 7l-5 5 5 5'} />
      </svg>
    </button>
  );
}
