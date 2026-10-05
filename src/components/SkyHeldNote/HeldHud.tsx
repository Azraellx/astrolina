// AstroLina: web-based astrocartography for curious minds.
// Copyright (C) 2026 AstroLina <https://astrolina.org>
// SPDX-License-Identifier: AGPL-3.0-only
// Licensed under the GNU AGPL v3.0 with an additional attribution term under
// AGPL section 7(b). See the LICENSE and NOTICE files; this notice must be kept.

import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useMovableHud, effectiveCenterX } from '../../lib/useMovableHud';
import { HudHeader } from '../ui/HudHeader';
import { SkyHeldNote } from './SkyHeldNote';
// The shared floating-window chrome (.timeline-hud + .location-*), as Local Space
// uses it, so the card frosts and recolours with the theme like every other window.
import '../TimelineHud/TimelineHud.css';
import '../LocationHud/LocationHud.css';
import './SkyHeldNote.css';

// What the host draws IN PLACE OF a tool that is open when the map turns geodetic
// (a tool extension declaring `needsSiderealTime`; lib/skyHold, 2026-10-02). The tool
// itself is never rendered while held — so it takes no view lock and parks nothing,
// and the map stays usable — and this card holds its place: the tool's own name, the
// reason with its fix, and a close that really closes the tool. Nothing is written:
// the tool's open flag stays as the reader left it, and switching the line system
// back to Celestial puts the tool itself back where this card was.
export function HeldHud({
  title,
  posKey,
  onClose,
  onFix,
}: {
  /** The held tool's own label — the card's title, and its close X's name. */
  title: string;
  /** localStorage key for the card's position (one shared by every held tool is
   *  fine: only one tool is open at a time). */
  posKey: string;
  /** Close the TOOL — the same action as its Tools-menu row. Closing is never held. */
  onClose: () => void;
  /** Open Settings ▸ Calculation, where the line system is. */
  onFix: () => void;
}) {
  const { t } = useT();
  // The header eye collapses the card to its title bar, as on the other windows.
  const [collapsed, setCollapsed] = useState(false);
  const hudRef = useRef<HTMLDivElement>(null);
  const { pos, dragging, handleProps } = useMovableHud(hudRef, {
    posKey,
    floating: true,
    // Centred on the effective centre (half the 260px card), and clear BELOW where the
    // Local Space window opens (y 144). On a geodetic map that window is held too, and
    // its card is this card's height, so 40px lower — the first default — put this one
    // over its sentence and fix. (2026-10-05)
    initial: () => ({ x: Math.round(effectiveCenterX() - 130), y: 296 }),
  });
  return (
    <div
      ref={hudRef}
      className={`timeline-hud location-hud held-hud${dragging ? ' thud-dragging' : ''}${collapsed ? ' is-collapsed' : ''}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none' }
          : undefined
      }
      role="region"
      aria-label={title}
    >
      <HudHeader
        title={title}
        handleProps={handleProps}
        dragging={dragging}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onClose={onClose}
        closeLabel={t('common.hud.closeNamed', { name: title })}
        // The label says it all; an empty hint keeps the tip to that one line.
        closeHint=""
      />
      <div className="held-hud-body">
        <SkyHeldNote onFix={onFix} />
      </div>
    </div>
  );
}
